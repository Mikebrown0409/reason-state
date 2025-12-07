import { ReasonState } from "../../src/engine/ReasonState.js";
import type { EchoState, Patch } from "../../src/engine/types.js";
import { grokPlanWithContext, type GrokPlanResult } from "../../src/tools/grokChat.js";
import { xSearch } from "../../src/tools/xSearch.js";
import { mockBooking } from "../../src/tools/mockBooking.js";

export type XAgentResult = {
  history: Array<{ state: EchoState; label: string }>;
  events: string[];
  plan?: string;
  planPatches?: Patch[];
  planMeta?: Omit<GrokPlanResult, "patches">;
  xCount: number;
};

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * X + Grok + booking example agent (single file):
 * - Seeds goal/budget/assumption
 * - Pulls live X posts (assumptions with lineage)
 * - Uses Grok with deterministic context to plan
 * - Runs governed booking
 */
export async function runXAgent(
  query: string,
  budget: number,
  injectedAssumptions: Array<{ summary: string; sourceId?: string; sourceType?: string }> = []
): Promise<XAgentResult> {
  const engine = new ReasonState();
  const events: string[] = [];
  const history: Array<{ state: EchoState; label: string }> = [];

  const applyStep = (patches: Patch[], label: string) => {
    engine.applyPatches(patches);
    history.push({ state: clone(engine.snapshot), label });
    events.push(label);
  };

  // Seed goal + budget + assumption
  applyStep(
    [
      {
        op: "add",
        path: "/raw/goal",
        value: {
          id: "goal",
          type: "planning",
          summary: `Plan for ${query}`,
          details: { destination: query, budget }
        }
      },
      {
        op: "add",
        path: "/raw/budget",
        value: { id: "budget", type: "fact", details: { amount: budget } }
      },
      {
        op: "add",
        path: "/raw/assumption-destination",
        value: { id: "assumption-destination", type: "assumption", assumptionStatus: "valid", summary: `Destination=${query}` }
      }
    ],
    `Seed goal (${budget.toLocaleString()} budget)`
  );

  // Live X search
  let xCount = 0;
  try {
    const xPatches = await xSearch(`${query} travel`);
    xCount = xPatches.length;
    if (xPatches.length > 0) {
      applyStep(xPatches, `Live X: ${xPatches.length} posts`);
    } else {
      events.push("Live X: no results");
    }
  } catch (err) {
    events.push(`X error: ${String(err)}`);
  }

  // Injected assumptions (optional)
  if (injectedAssumptions.length > 0) {
    const injectPatches: Patch[] = injectedAssumptions.map((a, i) => ({
      op: "add",
      path: `/raw/inject-${Date.now()}-${i}`,
      value: {
        id: `inject-${Date.now()}-${i}`,
        type: "assumption",
        summary: a.summary,
        assumptionStatus: "valid",
        sourceId: a.sourceId ?? `inject-${i}`,
        sourceType: a.sourceType ?? "user"
      }
    }));
    applyStep(injectPatches, `Injected assumptions (${injectedAssumptions.length})`);
  }

  // Grok plan (validated patches)
  let planPatches: Patch[] | undefined;
  let planSummary: string | undefined;
  let planMeta: Omit<GrokPlanResult, "patches"> | undefined;
  try {
    const planRes = await grokPlanWithContext(engine.snapshot, `Create a concise plan for: ${query}, budget ${budget}`);
    planPatches = planRes.patches;
    planMeta = { attempts: planRes.attempts, lastError: planRes.lastError, raw: planRes.raw };
    if (planPatches.length > 0) {
      applyStep(planPatches, "Grok plan ready");
      planSummary = JSON.stringify(planPatches, null, 2);
    } else {
      events.push("Grok plan empty");
    }
  } catch (err) {
    events.push(`Grok error: ${String(err)}`);
  }

  // Booking
  const bookingPatches = await mockBooking({
    id: "xagent",
    destination: query,
    budget,
    unknowns: engine.snapshot.unknowns,
    startDate: "2025-12-20",
    endDate: "2025-12-23"
  });
  applyStep(
    bookingPatches,
    bookingPatches[0]?.value && (bookingPatches[0].value as any).status === "blocked" ? "Booking blocked" : "Booking placed"
  );

  if (planMeta) {
    events.push(`Grok validation: attempts=${planMeta.attempts}${planMeta.lastError ? ` lastError=${planMeta.lastError}` : ""}`);
  }

  return { history, events, plan: planSummary, planPatches, planMeta, xCount };
}

