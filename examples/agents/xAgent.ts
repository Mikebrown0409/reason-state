import { ReasonState } from "../../src/engine/ReasonState.js";
import type { EchoState, Patch, ReasonStateOptions } from "../../src/engine/types.js";
import { grokPlanWithContext, type GrokPlanResult } from "../../src/tools/grokChat.js";
import { xSearch } from "../../src/tools/xSearch.js";
import { mockBooking } from "../../src/tools/mockBooking.js";

export type XAgentResult = {
  history: Array<{ state: EchoState; label: string }>;
  events: string[];
  plan?: string;
  planPatches?: Patch[];
  planMeta?: Omit<GrokPlanResult, "patches">;
  planMetaHistory?: Array<Omit<GrokPlanResult, "patches"> & { label: string }>;
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
  injectedAssumptions: Array<{ summary: string; sourceId?: string; sourceType?: string }> = [],
  options: ReasonStateOptions = {}
): Promise<XAgentResult> {
  const engine = new ReasonState(options);
  const events: string[] = [];
  const history: Array<{ state: EchoState; label: string }> = [];
  const planMetaHistory: Array<Omit<GrokPlanResult, "patches"> & { label: string }> = [];

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
      ,
      { op: "add", path: "/summary/goal", value: `Goal: ${query}` }
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

  // Grok plan (validated patches), multi-turn governance-aware
  const planSummaries: string[] = [];
  let planPatches: Patch[] | undefined;
  let planMeta: Omit<GrokPlanResult, "patches"> | undefined;

  async function runPlanTurn(label: string, goal: string) {
    try {
      const planRes = await grokPlanWithContext(engine.snapshot, goal);
      planMetaHistory.push({ attempts: planRes.attempts, lastError: planRes.lastError, raw: planRes.raw, label });
      if (planRes.patches.length > 0) {
        planPatches = planRes.patches;
        applyStep(planRes.patches, label);
        planSummaries.push(JSON.stringify(planRes.patches, null, 2));
      } else {
        events.push(`${label}: empty plan`);
      }
      planMeta = { attempts: planRes.attempts, lastError: planRes.lastError, raw: planRes.raw };
    } catch (err) {
      events.push(`${label}: Grok error ${String(err)}`);
    }
  }

  await runPlanTurn("Plan turn 1", `Create a concise plan for: ${query}, budget ${budget}`);

  const hasBlockers = (engine.snapshot.unknowns?.length ?? 0) > 0 || Object.values(engine.snapshot.raw ?? {}).some((n) => n.dirty);
  if (!planPatches || hasBlockers) {
    await runPlanTurn(
      "Plan turn 2 (resolve blockers)",
      `Resolve blockers/unknowns and refine plan for: ${query}, budget ${budget}. Prioritize clearing unknowns/dirty nodes.`
    );
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

  const planSummary = planSummaries.join("\n---\n");

  return { history, events, plan: planSummary, planPatches, planMeta, planMetaHistory, xCount };
}

