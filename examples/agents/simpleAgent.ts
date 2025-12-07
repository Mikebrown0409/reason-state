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

/**
 * Minimal agent example: no X API. Seeds goal/budget, uses Grok with deterministic context,
 * then runs governed booking.
 */
export async function runSimpleAgent(
  query: string,
  budget: number,
  injectedFacts?: Array<{ summary: string }>,
  options: ReasonStateOptions & { bookingDates?: { startDate: string; endDate: string } } = {},
  initialState?: EchoState
): Promise<SimpleAgentResult> {
  const baseState = initialState ? clone(initialState) : undefined;
  const engine = new ReasonState(options, baseState);
  const events: string[] = [];
  const history: Array<{ state: EchoState; label: string }> = [];
  const planMetaHistory: Array<Omit<GrokPlanResult, "patches"> & { label: string }> = [];

  const applyStep = (patches: Patch[], label: string) => {
    engine.applyPatches(patches);
    history.push({ state: clone(engine.snapshot), label });
    events.push(label);
  };

  // Seed or update goal and budget
  const hasGoal = Boolean(engine.snapshot.raw["goal"]);
  const hasBudget = Boolean(engine.snapshot.raw["budget"]);
  const hasAgentNote = Boolean(engine.snapshot.summary?.["agent-note"]);
  const seedPatches: Patch[] = [];
  seedPatches.push({
    op: hasGoal ? "replace" : "add",
    path: "/raw/goal",
    value: {
      id: "goal",
      type: "planning",
      summary: `Plan for ${query}`,
      details: { destination: query, budget }
    }
  });
  seedPatches.push({
    op: hasGoal ? "replace" : "add",
    path: "/summary/goal",
    value: `Goal: ${query}`
  });
  seedPatches.push({
    op: hasBudget ? "replace" : "add",
    path: "/raw/budget",
    value: { id: "budget", type: "fact", details: { amount: budget } }
  });
  seedPatches.push({
    op: hasBudget ? "replace" : "add",
    path: "/summary/budget",
    value: `Budget: ${budget}`
  });
  if (!hasAgentNote) {
    seedPatches.push({
      op: "add",
      path: "/summary/agent-note",
      value: "Agent note: pending"
    });
  }
  applyStep(seedPatches, hasGoal || hasBudget ? "Update goal/budget" : `Seed goal (${budget.toLocaleString()} budget)`);

  if (injectedFacts && injectedFacts.length > 0) {
    const existingInputs = Object.keys(engine.snapshot.raw ?? {}).filter((k) => k.startsWith("input-")).length;
    const factPatches: Patch[] = injectedFacts.flatMap((f, i) => {
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

  // Grok plan with deterministic context (multi-turn governance-aware)
  const planSummaries: string[] = [];
  let planPatches: Patch[] | undefined;
  let planMeta: Omit<GrokPlanResult, "patches"> | undefined;
  let planMessages: string[] | undefined;
  let agentNote: string | undefined;

  async function runPlanTurn(label: string, goal: string) {
    try {
      const planRes = await grokPlanWithContext(engine.snapshot, goal);
      planMetaHistory.push({ attempts: planRes.attempts, lastError: planRes.lastError, raw: planRes.raw, label });
      if (planRes.patches.length > 0) {
        planPatches = planRes.patches;
        applyStep(planRes.patches, label);
        planSummaries.push(JSON.stringify(planRes.patches, null, 2));
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

  await runPlanTurn(
    "Plan turn 1",
    `Create a concise plan for: ${query}, budget ${budget}. Also replace /summary/agent-note with a <=200 char next-step message (summaries only; no details).`
  );

  // If governance blockers remain (unknowns/dirty) or no patches, attempt a second turn focused on blockers
  const hasBlockers = (engine.snapshot.unknowns?.length ?? 0) > 0 || Object.values(engine.snapshot.raw ?? {}).some((n) => n.dirty);
  if (!planPatches || hasBlockers) {
    await runPlanTurn(
      "Plan turn 2 (resolve blockers)",
      `Resolve blockers/unknowns and refine plan for: ${query}, budget ${budget}. Prioritize clearing unknowns/dirty nodes. Also replace /summary/agent-note with a <=200 char next-step message (summaries only; no details).`
    );
  }

  // Resolve date-related unknowns if user provided dates
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
      applyStep(resolveUnknowns, "Resolve missing dates");
    }
  }

  // Booking (governed)
  const bookingPatches = await mockBooking({
    id: "simple",
    destination: query,
    budget,
    unknowns: engine.snapshot.unknowns,
    startDate: options.bookingDates?.startDate,
    endDate: options.bookingDates?.endDate
  });
  const bookingBlocked = bookingPatches[0]?.value && (bookingPatches[0].value as any).status === "blocked";
  applyStep(bookingPatches, bookingBlocked ? "Booking blocked" : "Booking placed");

  if (planMeta) {
    events.push(`Grok validation: attempts=${planMeta.attempts}${planMeta.lastError ? ` lastError=${planMeta.lastError}` : ""}`);
  }

  const bookingNode = (bookingPatches.find((p) => (p.value as any)?.type === "action")?.value ??
    bookingPatches[0]?.value) as any;
  const agentMessageFromBooking = bookingNode
    ? bookingBlocked
      ? bookingNode?.details?.conflict
        ? `Booking blocked: dates clash (${bookingNode.details.conflict.startDate}–${bookingNode.details.conflict.endDate}). Try new dates.`
        : bookingNode?.details?.missing
          ? `Booking blocked: missing ${bookingNode.details.missing.join(", ")}.`
          : bookingNode?.summary ?? "Booking blocked."
      : `Booked for ${bookingNode?.details?.destination ?? query} within budget ${bookingNode?.details?.budget ?? budget}.`
    : "";
  const agentMessage = agentNote || agentMessageFromBooking;

  const planSummary = planSummaries.join("\n---\n");

  const resolvedAgentMessage =
    agentNote && agentNote !== "Agent note: pending" ? agentNote : agentMessageFromBooking;

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

