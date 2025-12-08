import { ReasonState } from "../engine/ReasonState.js";
import type { EchoState, Patch, ReasonStateOptions } from "../engine/types.js";
import { grokPlanWithContext, type GrokPlanResult } from "../tools/grokChat.js";

export type PlanAndActInput = {
  goal: string;
  budget: number;
  facts?: Array<{ summary: string }>;
  options?: ReasonStateOptions;
  initialState?: EchoState;
};

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

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function describePatch(p: Patch): string {
  if (p.path.startsWith("/summary/")) {
    return `Set ${p.path.replace("/summary/", "")} summary to "${String(p.value)}"`;
  }
  if (p.path.startsWith("/raw/")) {
    const id = p.path.replace("/raw/", "");
    const val = p.value as any;
    const status = val?.status ? ` status=${val.status}` : "";
    return `Upsert node ${id} (${val?.type ?? "node"})${status}`;
  }
  return `${p.op} ${p.path}`;
}

const DEFAULT_PLAN_PROMPT = (goal: string, budget: number) =>
  `Create a concise plan for: ${goal}, budget ${budget}. Consider existing booking summaries; avoid overlapping dates with blocked/resolved bookings. If clashes exist, ask for new dates. You must replace /summary/agent-note with <=200 char next step that reflects any new facts/assumptions (summaries only; no details).`;

const BLOCKER_PROMPT = (goal: string, budget: number) =>
  `Resolve blockers/unknowns and refine plan for: ${goal}, budget ${budget}. Avoid overlapping dates with existing bookings; if clash, ask for new dates. You must replace /summary/agent-note with <=200 char next step that reflects any new facts/assumptions (summaries only; no details).`;

/**
 * planAndAct: minimal, governed wrapper with built-in prompt and deterministic agent-note fallback.
 */
export async function planAndAct(input: PlanAndActInput): Promise<PlanAndActResult> {
  const { goal, budget, facts, options, initialState } = input;
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

  // Seed goal/budget and agent note
  const hasGoal = Boolean(engine.snapshot.raw["goal"]);
  const hasBudget = Boolean(engine.snapshot.raw["budget"]);
  const hasAgentNote = Boolean(engine.snapshot.summary?.["agent-note"]);
  const seed: Patch[] = [
    {
      op: hasGoal ? "replace" : "add",
      path: "/raw/goal",
      value: { id: "goal", type: "planning", summary: `Plan for ${goal}`, details: { destination: goal, budget } }
    },
    { op: hasGoal ? "replace" : "add", path: "/summary/goal", value: `Goal: ${goal}` },
    { op: hasBudget ? "replace" : "add", path: "/raw/budget", value: { id: "budget", type: "fact", details: { amount: budget } } },
    { op: hasBudget ? "replace" : "add", path: "/summary/budget", value: `Budget: ${budget}` }
  ];
  if (!hasAgentNote) {
    seed.push({ op: "add", path: "/summary/agent-note", value: "Agent note: pending" });
  }
  applyStep(seed, hasGoal || hasBudget ? "Update goal/budget" : `Seed goal (${budget.toLocaleString()} budget)`);

  // Inject facts/assumptions with summaries
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

  // Plan turns
  let planPatches: Patch[] | undefined;
  let planMeta: Omit<GrokPlanResult, "patches"> | undefined;
  let agentNote: string | undefined;

  async function runPlanTurn(label: string, prompt: string) {
    try {
      const planRes = await grokPlanWithContext(engine.snapshot, prompt);
      planMetaHistory.push({ attempts: planRes.attempts, lastError: planRes.lastError, raw: planRes.raw, label });
      if (planRes.patches.length > 0) {
        planPatches = planRes.patches;
        applyStep(planRes.patches, label);
        planMessages = planRes.patches.map(describePatch);
        agentNote = engine.snapshot.summary?.["agent-note"];
      } else {
        events.push(`${label}: empty plan`);
      }
      planMeta = { attempts: planRes.attempts, lastError: planRes.lastError, raw: planRes.raw };
    } catch (err) {
      events.push(`${label}: Grok error ${String(err)}`);
    }
  }

  await runPlanTurn("Plan turn 1", DEFAULT_PLAN_PROMPT(goal, budget));
  const hasBlockers = (engine.snapshot.unknowns?.length ?? 0) > 0 || Object.values(engine.snapshot.raw ?? {}).some((n) => n.dirty);
  if (!planPatches || hasBlockers) {
    await runPlanTurn("Plan turn 2 (resolve blockers)", BLOCKER_PROMPT(goal, budget));
  }

  // Fallback agent-note if model skipped it
  if ((!agentNote || agentNote === "Agent note: pending") && facts && facts.length > 0) {
    const factsText = facts.map((f) => f.summary).join("; ");
    const notePatch: Patch = {
      op: engine.snapshot.summary?.["agent-note"] ? "replace" : "add",
      path: "/summary/agent-note",
      value: `Updated with new facts: ${factsText}`
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
    agentMessage: resolvedAgentMessage
  };
}

