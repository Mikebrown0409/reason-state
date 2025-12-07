import { ReasonState } from "../../src/engine/ReasonState.js";
import type { EchoState, Patch } from "../../src/engine/types.js";
import { grokPlanWithContext, type GrokPlanResult } from "../../src/tools/grokChat.js";
import { mockBooking } from "../../src/tools/mockBooking.js";

export type SimpleAgentResult = {
  history: Array<{ state: EchoState; label: string }>;
  events: string[];
  plan?: string;
  planPatches?: Patch[];
  planMeta?: Omit<GrokPlanResult, "patches">;
};

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Minimal agent example: no X API. Seeds goal/budget, uses Grok with deterministic context,
 * then runs governed booking.
 */
export async function runSimpleAgent(query: string, budget: number): Promise<SimpleAgentResult> {
  const engine = new ReasonState();
  const events: string[] = [];
  const history: Array<{ state: EchoState; label: string }> = [];

  const applyStep = (patches: Patch[], label: string) => {
    engine.applyPatches(patches);
    history.push({ state: clone(engine.snapshot), label });
    events.push(label);
  };

  // Seed goal and budget
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
      }
    ],
    `Seed goal (${budget.toLocaleString()} budget)`
  );

  // Grok plan with deterministic context
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

  // Booking (governed)
  const bookingPatches = await mockBooking({
    id: "simple",
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

  return { history, events, plan: planSummary, planPatches, planMeta };
}

