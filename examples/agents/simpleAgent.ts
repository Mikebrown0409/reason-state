import { ReasonState } from "../../src/engine/ReasonState.js";
import type { EchoState, Patch, ReasonStateOptions } from "../../src/engine/types.js";
import { grokPlanWithContext, type GrokPlanResult } from "../../src/tools/grokChat.js";
import { mockBooking } from "../../src/tools/mockBooking.js";

export type SimpleAgentResult = {
  history: Array<{ state: EchoState; label: string }>;
  events: string[];
  plan?: string;
  planPatches?: Patch[];
  planMeta?: Omit<GrokPlanResult, "patches">;
  planMetaHistory?: Array<Omit<GrokPlanResult, "patches"> & { label: string }>;
};

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Minimal agent example: no X API. Seeds goal/budget, uses Grok with deterministic context,
 * then runs governed booking.
 */
export async function runSimpleAgent(
  query: string,
  budget: number,
  injectedFacts?: Array<{ summary: string }>,
  options: ReasonStateOptions & { bookingDates?: { startDate: string; endDate: string } } = {}
): Promise<SimpleAgentResult> {
  const engine = new ReasonState(options);
  const events: string[] = [];
  const history: Array<{ state: EchoState; label: string }> = [];
  const planMetaHistory: Array<Omit<GrokPlanResult, "patches"> & { label: string }> = [];

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
      { op: "add", path: "/summary/goal", value: `Goal: ${query}` },
      { op: "add", path: "/summary/budget", value: `Budget: ${budget}` },
      {
        op: "add",
        path: "/raw/budget",
        value: { id: "budget", type: "fact", details: { amount: budget } }
      }
    ],
    `Seed goal (${budget.toLocaleString()} budget)`
  );

  if (injectedFacts && injectedFacts.length > 0) {
    const factPatches = injectedFacts.flatMap((f, i) => [
      {
        op: "add",
        path: `/raw/input-${i}`,
        value: {
          id: `input-${i}`,
          type: "assumption",
          summary: f.summary,
          details: { provided: true },
          assumptionStatus: "valid",
          status: "open",
          sourceType: "user",
          sourceId: `input-${i}`
        }
      },
      { op: "add", path: `/summary/input-${i}`, value: `User input: ${f.summary}` }
    ]);
    applyStep(factPatches, "Injected facts");
  }

  // Grok plan with deterministic context (multi-turn governance-aware)
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

  // If governance blockers remain (unknowns/dirty) or no patches, attempt a second turn focused on blockers
  const hasBlockers = (engine.snapshot.unknowns?.length ?? 0) > 0 || Object.values(engine.snapshot.raw ?? {}).some((n) => n.dirty);
  if (!planPatches || hasBlockers) {
    await runPlanTurn(
      "Plan turn 2 (resolve blockers)",
      `Resolve blockers/unknowns and refine plan for: ${query}, budget ${budget}. Prioritize clearing unknowns/dirty nodes.`
    );
  }

  // Booking (governed)
  const bookingPatches = await mockBooking({
    id: "simple",
    destination: query,
    budget,
    unknowns: engine.snapshot.unknowns,
    startDate: options.bookingDates?.startDate ?? "2025-12-20",
    endDate: options.bookingDates?.endDate ?? "2025-12-23"
  });
  applyStep(
    bookingPatches,
    bookingPatches[0]?.value && (bookingPatches[0].value as any).status === "blocked" ? "Booking blocked" : "Booking placed"
  );

  if (planMeta) {
    events.push(`Grok validation: attempts=${planMeta.attempts}${planMeta.lastError ? ` lastError=${planMeta.lastError}` : ""}`);
  }

  const planSummary = planSummaries.join("\n---\n");

  return { history, events, plan: planSummary, planPatches, planMeta, planMetaHistory };
}

