import { ReasonState } from "../../src/engine/ReasonState.js";
import type { EchoState, Patch, ReasonStateOptions } from "../../src/engine/types.js";
import { grokPlanWithContext, type GrokPlanResult } from "../../src/tools/grokChat.js";
import { mockBooking } from "../../src/tools/mockBooking.js";
import { xSearch } from "../../src/tools/xSearch.js";

export type DagAgentResult = {
  history: Array<{ state: EchoState; label: string }>;
  events: string[];
  plan?: string;
  planPatches?: Patch[];
  planMeta?: Omit<GrokPlanResult, "patches">;
  planMetaHistory?: Array<Omit<GrokPlanResult, "patches"> & { label: string }>;
  checkpoints?: string[];
  agentMessage?: string;
};

export type DagAgentOptions = ReasonStateOptions & {
  bookingDates?: { startDate: string; endDate: string };
  useX?: boolean;
  xQuery?: string;
  injectContradiction?: boolean;
};

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function describePatch(p: Patch): string {
  if (p.path.startsWith("/summary/")) return `Set ${p.path.replace("/summary/", "")} summary`;
  if (p.path.startsWith("/raw/")) return `Upsert ${p.path.replace("/raw/", "")}`;
  return `${p.op} ${p.path}`;
}

export async function runDagAgent(
  goal: string,
  budget: number,
  injectedAssumptions: Array<{ summary: string; sourceId?: string; sourceType?: string }> = [],
  options: DagAgentOptions = {},
  initialState?: EchoState
): Promise<DagAgentResult> {
  const engine = new ReasonState(options, initialState ? clone(initialState) : undefined);
  const events: string[] = [];
  const history: Array<{ state: EchoState; label: string }> = [];
  const planMetaHistory: Array<Omit<GrokPlanResult, "patches"> & { label: string }> = [];
  const checkpoints: string[] = [];

  async function applyStep(patches: Patch[], label: string) {
    const { state, checkpoint } = await engine.applyPatchesWithCheckpoint(patches, label);
    history.push({ state: clone(state), label });
    events.push(label);
    if (checkpoint?.id) checkpoints.push(checkpoint.id);
  }

  // Gate: block early if state is already dirty/unknown
  const allowed = engine.canExecute("action");
  if (!allowed) {
    events.push("Gate: blocked (unknown/dirty)");
    history.push({ state: clone(engine.snapshot), label: "Gate blocked" });
    return { history, events, planMetaHistory, checkpoints, agentMessage: "Blocked: unknown or dirty nodes present." };
  }

  // Seed or update goal/budget summaries for Grok context
  const seed: Patch[] = [
    {
      op: engine.snapshot.raw["goal"] ? "replace" : "add",
      path: "/raw/goal",
      value: {
        id: "goal",
        type: "planning",
        summary: `Plan for ${goal}`,
        details: { destination: goal, budget }
      }
    },
    {
      op: engine.snapshot.raw["goal"] ? "replace" : "add",
      path: "/summary/goal",
      value: `Goal: ${goal}`
    },
    {
      op: engine.snapshot.raw["budget"] ? "replace" : "add",
      path: "/raw/budget",
      value: { id: "budget", type: "fact", details: { amount: budget } }
    },
    {
      op: engine.snapshot.raw["budget"] ? "replace" : "add",
      path: "/summary/budget",
      value: `Budget: ${budget}`
    },
    {
      op: engine.snapshot.summary?.["agent-note"] ? "replace" : "add",
      path: "/summary/agent-note",
      value: "Agent note: pending"
    }
  ];
  await applyStep(seed, "Seed goal/budget");

  // Inject assumptions
  if (injectedAssumptions.length > 0) {
    const inject: Patch[] = injectedAssumptions.map((a, i) => ({
      op: "add",
      path: `/raw/inject-${Date.now()}-${i}`,
      value: {
        id: `inject-${Date.now()}-${i}`,
        type: "assumption",
        summary: a.summary,
        assumptionStatus: "valid",
        status: "open",
        sourceId: a.sourceId ?? `inject-${i}`,
        sourceType: a.sourceType ?? "user"
      }
    }));
    await applyStep(inject, `Injected assumptions (${inject.length})`);
  }

  // Research X (optional)
  if (options.useX) {
    try {
      const xPatches = await xSearch(options.xQuery ?? goal);
      if (xPatches.length > 0) await applyStep(xPatches, "Research X");
    } catch (err) {
      events.push(`X error: ${String(err)}`);
    }
  }

  // Plan with Grok (multi-turn if blockers)
  let planPatches: Patch[] | undefined;
  let planMeta: Omit<GrokPlanResult, "patches"> | undefined;
  let planMessages: string[] | undefined;
  const hasBlockersNow = () =>
    (engine.snapshot.unknowns?.length ?? 0) > 0 || Object.values(engine.snapshot.raw ?? {}).some((n) => n.dirty);

  async function runPlanTurn(label: string, prompt: string) {
    try {
      const planRes = await grokPlanWithContext(engine.snapshot, prompt);
      planMetaHistory.push({ attempts: planRes.attempts, lastError: planRes.lastError, raw: planRes.raw, label });
      if (planRes.patches.length > 0) {
        planPatches = planRes.patches;
        planMessages = planRes.patches.map(describePatch);
        await applyStep(planRes.patches, label);
      } else {
        events.push(`${label}: empty plan`);
      }
      planMeta = { attempts: planRes.attempts, lastError: planRes.lastError, raw: planRes.raw };
    } catch (err) {
      events.push(`${label}: Grok error ${String(err)}`);
    }
  }

  await runPlanTurn(
    "Plan turn 1",
    `Create a concise plan for: ${goal}, budget ${budget}. Replace /summary/agent-note with <=200 char next step (summaries only).`
  );

  if (!planPatches || hasBlockersNow()) {
    await runPlanTurn(
      "Plan turn 2 (resolve blockers)",
      `Resolve blockers/unknowns and refine plan for: ${goal}, budget ${budget}. Replace /summary/agent-note with <=200 char next step (summaries only).`
    );
  }

  // Resolve date unknowns if dates provided
  if (options.bookingDates?.startDate && options.bookingDates?.endDate) {
    const resolveUnknowns: Patch[] = [];
    (engine.snapshot.unknowns ?? [])
      .filter((id) => id.startsWith("unknown-dates-"))
      .forEach((id) => {
        const node = engine.snapshot.raw[id];
        if (!node) return;
        resolveUnknowns.push({
          op: "replace",
          path: `/raw/${id}`,
          value: {
            ...node,
            status: "resolved",
            summary: "Travel dates provided",
            details: { ...(node.details as any), resolvedAt: new Date().toISOString() },
            dirty: false
          }
        });
      });
    if (resolveUnknowns.length > 0) {
      await applyStep(resolveUnknowns, "Resolve missing dates");
    }
  }

  // Book
  const bookingPatches = await mockBooking({
    id: "dag",
    destination: goal,
    budget,
    unknowns: engine.snapshot.unknowns,
    startDate: options.bookingDates?.startDate,
    endDate: options.bookingDates?.endDate
  });
  await applyStep(
    bookingPatches,
    bookingPatches[0]?.value && (bookingPatches[0].value as any).status === "blocked" ? "Booking blocked" : "Booking placed"
  );

  // Optional injected contradiction to showcase self-heal
  if (options.injectContradiction) {
    const contradictionId = `contradiction-${Date.now()}`;
    const goalNode = engine.snapshot.raw["goal"];
    const contradictory = goalNode
      ? {
          id: contradictionId,
          type: "planning",
          status: "open",
          summary: `Conflicting plan for ${goal} (alternate)`,
          details: { destination: goal, budget: budget + 1000, contradicts: ["goal"] },
          contradicts: ["goal"],
          sourceType: "agent",
          sourceId: "dag-contradiction"
        }
      : {
          id: contradictionId,
          type: "planning",
          status: "open",
          summary: "Conflicting plan (no goal present)",
          contradicts: ["goal"],
          sourceType: "agent",
          sourceId: "dag-contradiction"
        };
    const contradictionPatch: Patch = {
      op: "add",
      path: `/raw/${contradictionId}`,
      value: contradictory
    };
    await applyStep([contradictionPatch], "Inject contradiction");
  }

  // Self-heal/replay checkpoint (optional deterministic check)
  try {
    const healed = await engine.selfHealAndReplay();
    history.push({ state: clone(healed), label: "Self-heal replay" });
    events.push("Self-heal replay");
  } catch (err) {
    events.push(`Self-heal error: ${String(err)}`);
  }

  // Agent message from agent-note or booking status
  const agentMessage =
    engine.snapshot.summary?.["agent-note"] ??
    (bookingPatches[0]?.value as any)?.summary ??
    planMessages?.join(" | ") ??
    "";

  const planSummary = planMessages?.join("\n") ?? planPatches?.map(describePatch).join("\n");

  return {
    history,
    events,
    plan: planSummary,
    planPatches,
    planMeta,
    planMetaHistory,
    checkpoints,
    agentMessage
  };
}


