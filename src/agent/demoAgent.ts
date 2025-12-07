import { ReasonState } from "../engine/ReasonState.js";
import { grokChat, grokPlanPatch } from "../tools/grokChat.js";
import { xSearch } from "../tools/xSearch.js";
import { mockBooking } from "../tools/mockBooking.js";
import type { EchoState, Patch } from "../engine/types.js";

export type AgentRun = {
  history: Array<{ state: EchoState; label: string }>;
  events: string[];
  plan?: string;
  xCount: number;
};

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// Adapter-agnostic demo agent: uses X + Grok + mock booking, but only via patches into ReasonState.
export async function runDemoAgent(
  query: string,
  budget: number,
  injectedAssumptions: Array<{ summary: string; sourceId?: string; sourceType?: string }> = []
): Promise<AgentRun> {
  const engine = new ReasonState();
  const events: string[] = [];
  const history: Array<{ state: EchoState; label: string }> = [];

  const applyStep = (patches: Patch[], label: string) => {
    engine.applyPatches(patches);
    history.push({ state: clone(engine.snapshot), label, idx: history.length });
    events.push(label);
  };

  // Step 1: seed planning + budget + assumption (generic)
  applyStep(
    [
      {
        op: "add",
        path: "/raw/planning-1",
        value: {
          id: "planning-1",
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
    `Seed plan (${budget.toLocaleString()} budget)`
  );

  // Step 2: live X search -> assumptions from posts (source metadata included)
  const xPatches = await xSearch(`${query} travel`);
  const xCount = xPatches.length;
  if (xPatches.length > 0) {
    applyStep(xPatches, `Live X: ${xPatches.length} posts`);
  } else {
    events.push("Live X: no results");
  }

  // Step 2b: injected assumptions (optional)
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

  // Step 3: Grok plan -> planning patch
  let plan = "";
  try {
    plan = await grokChat(`Create a concise plan for: ${query}, budget ${budget}`);
    applyStep([grokPlanPatch(plan)], "Grok plan ready");
  } catch (err) {
    events.push(`Grok error: ${String(err)}`);
  }

  // Step 4: Booking (mock) uses current unknowns; emits patches only
  const bookingPatches = await mockBooking({ id: "demo", destination: query, budget, unknowns: engine.snapshot.unknowns });
  applyStep(bookingPatches, bookingPatches[0]?.value && (bookingPatches[0].value as any).status === "blocked" ? "Booking blocked" : "Booking placed");

  // Step 5: Inject a contradiction and self-heal (generic governance)
  applyStep(
    [
      { op: "add", path: "/raw/fact-noisy", value: { id: "fact-noisy", type: "fact", details: { contradicts: "fact-quiet" }, summary: "Area is noisy" } },
      { op: "add", path: "/raw/fact-quiet", value: { id: "fact-quiet", type: "fact", summary: "Area is quiet" } }
    ],
    "Contradiction injected"
  );
  await engine.selfHealAndReplay();
  history.push({ state: clone(engine.snapshot), label: "Self-heal applied" });
  events.push("Self-heal applied");

  return { history, events, plan, xCount };
}

