import { ReasonState } from "../../src/engine/ReasonState.js";
import { buildContext } from "../../src/context/contextBuilder.js";
import type { EchoState, Patch } from "../../src/engine/types.js";
import type { Planner, PlannerResult } from "../../src/agent/planAndAct.js";
import { plannerStub } from "../tools/plannerStub.js";

type CodingAgentInput = {
  goal: string;
  facts?: Array<{ summary: string }>;
  planner?: Planner;
  initialState?: EchoState;
};

type CodingAgentResult = {
  history: Array<{ state: EchoState; label: string }>;
  events: string[];
  planPatches?: Patch[];
  planMeta?: Omit<PlannerResult, "patches">;
  planMessages?: string[];
  agentMessage?: string;
  context: string;
};

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export async function runCodingAgent(input: CodingAgentInput): Promise<CodingAgentResult> {
  const { goal, facts, planner = plannerStub, initialState } = input;
  const engine = new ReasonState({}, initialState ? clone(initialState) : undefined);
  const events: string[] = [];
  const history: Array<{ state: EchoState; label: string }> = [];

  const applyStep = (patches: Patch[], label: string) => {
    engine.applyPatches(patches);
    history.push({ state: clone(engine.snapshot), label });
    events.push(label);
  };

  // Seed goal and agent note
  if (!engine.snapshot.raw.goal) {
    applyStep(
      [
        {
          op: "add",
          path: "/raw/goal",
          value: { id: "goal", type: "planning", summary: `Code task: ${goal}`, details: { goal } }
        },
        { op: "add", path: "/summary/goal", value: `Goal: ${goal}` }
      ],
      "Seed goal"
    );
  }
  if (!engine.snapshot.summary?.["agent-note"]) {
    applyStep([{ op: "add", path: "/summary/agent-note", value: "Agent note: pending" }], "Seed agent note");
  }

  // Inject optional facts/assumptions
  if (facts && facts.length > 0) {
    const existingInputs = Object.keys(engine.snapshot.raw ?? {}).filter((k) => k.startsWith("input-")).length;
    const factPatches: Patch[] = facts.flatMap((f, i) => {
      const id = `input-${existingInputs + i}`;
      return [
        {
          op: "add",
          path: `/raw/${id}`,
          value: {
            id,
            type: "assumption",
            summary: f.summary,
            details: { provided: true },
            assumptionStatus: "valid",
            status: "open",
            sourceType: "user",
            sourceId: id
          }
        },
        { op: "add", path: `/summary/${id}`, value: `User input: ${f.summary}` }
      ];
    });
    applyStep(factPatches, "Injected facts");
  }

  // Build context and call planner
  const ctx = buildContext(engine.snapshot, { includeTimeline: true });
  const planRes = await planner(engine.snapshot, `Coding task: ${goal}\n${ctx}`);
  if (planRes.patches.length > 0) {
    applyStep(planRes.patches, "Plan");
  }

  return {
    history,
    events,
    planPatches: planRes.patches,
    planMeta: { attempts: planRes.attempts, lastError: planRes.lastError, raw: planRes.raw },
    planMessages: planRes.patches.map((p) => `${p.op} ${p.path}`),
    agentMessage: engine.snapshot.summary?.["agent-note"],
    context: ctx
  };
}

