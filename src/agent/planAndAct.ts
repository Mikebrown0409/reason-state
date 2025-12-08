import { ReasonState } from "../engine/ReasonState.js";
import type { EchoState, Patch, ReasonStateOptions } from "../engine/types.js";
import { grokPlanWithContext, type GrokPlanResult } from "../tools/grokChat.js";

export type PlannerResult = {
  patches: Patch[];
  attempts?: number;
  lastError?: string;
  raw?: string;
};

export type Planner = (state: EchoState, prompt: string) => Promise<PlannerResult>;

export type PlanInput = {
  seedPatches?: Patch[];
  facts?: Array<{ summary: string }>;
  planner?: Planner;
  prompt?: string;
  options?: ReasonStateOptions;
  initialState?: EchoState;
};
export type PlanAndActInput = PlanInput;

export type PlanAndActResult = {
  history: Array<{ state: EchoState; label: string }>;
  events: string[];
  plan?: string;
  planPatches?: Patch[];
  planMeta?: Omit<GrokPlanResult, "patches">;
  planMetaHistory?: Array<Omit<GrokPlanResult, "patches"> & { label: string }>;
  planMessages?: string[];
  agentMessage?: string;
};
export type PlanResult = PlanAndActResult;

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function describePatch(p: Patch): string {
  if (p.path.startsWith("/summary/")) {
    return `Set ${p.path.replace("/summary/", "")} summary to "${String(p.value)}"`;
  }
  if (p.path.startsWith("/raw/")) {
    const id = p.path.replace("/raw/", "");
    const val = p.value as { type?: string; status?: string } | string | number | undefined;
    const status =
      val && typeof val === "object" && "status" in val && val.status
        ? ` status=${val.status}`
        : "";
    const type = val && typeof val === "object" && "type" in val && val.type ? val.type : "node";
    return `Upsert node ${id} (${type})${status}`;
  }
  return `${p.op} ${p.path}`;
}

const DEFAULT_PLAN_PROMPT =
  "Create a concise next-step plan given the current state. Consider existing summaries and avoid conflicts in dependencies. You must replace /summary/agent-note with <=200 char next step that reflects any new facts/assumptions (summaries only; no details).";

const BLOCKER_PROMPT =
  "Resolve blockers/unknowns and refine the plan given the current state. Avoid conflicts in dependencies; if blocked, surface the needed inputs. You must replace /summary/agent-note with <=200 char next step that reflects any new facts/assumptions (summaries only; no details).";

/**
 * planAndAct: minimal, governed wrapper with built-in prompt and deterministic agent-note fallback.
 */
export async function plan(input: PlanInput): Promise<PlanAndActResult> {
  const { seedPatches = [], facts, planner, prompt, options, initialState } = input;
  const baseState = initialState ? clone(initialState) : undefined;
  const engine = new ReasonState(options, baseState);
  const events: string[] = [];
  const history: Array<{ state: EchoState; label: string }> = [];
  const planMetaHistory: Array<Omit<GrokPlanResult, "patches"> & { label: string }> = [];
  let planMessages: string[] | undefined;

  const applyStep = (patches: Patch[], label: string) => {
    engine.applyPatches(patches);
    history.push({ state: clone(engine.snapshot), label });
    events.push(label);
  };

  // Optional seeding (domain-agnostic)
  if (seedPatches.length > 0) {
    applyStep(seedPatches, "Seed patches");
  }
  if (!engine.snapshot.summary?.["agent-note"]) {
    applyStep(
      [{ op: "add", path: "/summary/agent-note", value: "Agent note: pending" }],
      "Seed agent note"
    );
  }

  // Inject facts/assumptions with summaries
  if (facts && facts.length > 0) {
    const existingInputs = Object.keys(engine.snapshot.raw ?? {}).filter((k) =>
      k.startsWith("input-")
    ).length;
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
            sourceId: id,
          },
        },
        { op: "add", path: `/summary/${id}`, value: `User input: ${f.summary}` },
      ];
    });
    applyStep(factPatches, "Injected facts");
  }

  // Plan turns
  let planPatches: Patch[] | undefined;
  let planMeta: Omit<GrokPlanResult, "patches"> | undefined;
  let agentNote: string | undefined;

  const plannerFn =
    planner ?? (async (state: EchoState, prompt: string) => grokPlanWithContext(state, prompt));

  async function runPlanTurn(label: string, prompt: string) {
    try {
      const planRes = await plannerFn(engine.snapshot, prompt);
      planMetaHistory.push({
        attempts: planRes.attempts ?? 0,
        lastError: planRes.lastError,
        raw: planRes.raw,
        label,
      });
      if (planRes.patches.length > 0) {
        planPatches = planRes.patches;
        applyStep(planRes.patches, label);
        planMessages = planRes.patches.map(describePatch);
        agentNote = engine.snapshot.summary?.["agent-note"];
      } else {
        events.push(`${label}: empty plan`);
      }
      planMeta = {
        attempts: planRes.attempts ?? 0,
        lastError: planRes.lastError,
        raw: planRes.raw,
      };
    } catch (err) {
      events.push(`${label}: Grok error ${String(err)}`);
    }
  }

  await runPlanTurn("Plan turn 1", prompt ?? DEFAULT_PLAN_PROMPT);
  const hasBlockers =
    (engine.snapshot.unknowns?.length ?? 0) > 0 ||
    Object.values(engine.snapshot.raw ?? {}).some((n) => n.dirty);
  if (!planPatches || hasBlockers) {
    await runPlanTurn("Plan turn 2 (resolve blockers)", prompt ?? BLOCKER_PROMPT);
  }

  // Fallback agent-note if model skipped it
  if ((!agentNote || agentNote === "Agent note: pending") && facts && facts.length > 0) {
    const factsText = facts.map((f) => f.summary).join("; ");
    const notePatch: Patch = {
      op: engine.snapshot.summary?.["agent-note"] ? "replace" : "add",
      path: "/summary/agent-note",
      value: `Updated with new facts: ${factsText}`,
    };
    applyStep([notePatch], "Agent note fallback (facts)");
    agentNote = engine.snapshot.summary?.["agent-note"];
  }

  const planSummary = planMessages?.join("\n") ?? planPatches?.map(describePatch).join("\n");
  const resolvedAgentMessage = agentNote && agentNote !== "Agent note: pending" ? agentNote : "";

  return {
    history,
    events,
    plan: planSummary,
    planPatches,
    planMeta,
    planMetaHistory,
    planMessages,
    agentMessage: resolvedAgentMessage,
  };
}

// Deprecated alias for compatibility
export const planAndAct = plan;
