import { ReasonState } from "../engine/ReasonState.js";
import type { EchoState, Patch, ReasonStateOptions } from "../engine/types.js";
import { grokPlanWithContext, type GrokPlanResult } from "../tools/grokChat.js";
import { mockBooking } from "../tools/mockBooking.js";

export type PlanAndActInput = {
  goal: string;
  budget: number;
  facts?: Array<{ summary: string }>;
  bookingDates?: { startDate: string; endDate: string };
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
  const { goal, budget, facts, bookingDates, options, initialState } = input;
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

  // If dates missing, short-circuit booking
  if (!bookingDates?.startDate || !bookingDates?.endDate) {
    const notePatch: Patch = {
      op: engine.snapshot.summary?.["agent-note"] ? "replace" : "add",
      path: "/summary/agent-note",
      value: agentNote || "Need start/end dates to proceed with booking."
    };
    applyStep([notePatch], "Booking skipped (dates missing)");
    return {
      history,
      events,
      plan: planMessages?.join("\n") ?? planPatches?.map(describePatch).join("\n"),
      planPatches,
      planMeta,
      planMetaHistory,
      planMessages,
      agentMessage: agentNote || "Need start/end dates to proceed with booking."
    };
  }

  // Booking
  if (!engine.canExecute("action")) {
    events.push("Booking skipped: blocked by governance (unknown/dirty)");
    return {
      history,
      events,
      plan: planMessages?.join("\n") ?? planPatches?.map(describePatch).join("\n"),
      planPatches,
      planMeta,
      planMetaHistory,
      planMessages,
      agentMessage: agentNote
    };
  }

  const existingBookingId = Object.keys(engine.snapshot.raw ?? {}).find((id) => id.startsWith("booking-"));
  const reuseExisting =
    existingBookingId &&
    (engine.snapshot.raw[existingBookingId]?.details as any)?.destination === goal &&
    (engine.snapshot.raw[existingBookingId]?.details as any)?.budget === budget;
  const bookingId = reuseExisting
    ? existingBookingId!
    : `booking-${goal}-${bookingDates?.startDate ?? "nodates"}-${bookingDates?.endDate ?? "nodates"}`;

  const bookingPatches = await mockBooking({
    id: bookingId,
    destination: goal,
    budget,
    unknowns: engine.snapshot.unknowns,
    startDate: bookingDates?.startDate,
    endDate: bookingDates?.endDate
  });
  const bookingBlocked = bookingPatches[0]?.value && (bookingPatches[0].value as any).status === "blocked";
  applyStep(bookingPatches, bookingBlocked ? "Booking blocked" : "Booking placed");

  const bookingNode = (bookingPatches.find((p) => (p.value as any)?.type === "action")?.value ??
    bookingPatches[0]?.value) as any;
  const agentMessageFromBooking = bookingNode
    ? bookingBlocked
      ? bookingNode?.details?.conflict
        ? `Booking blocked: dates clash (${bookingNode.details.conflict.startDate}–${bookingNode.details.conflict.endDate}). Try new dates.`
        : bookingNode?.details?.missing
          ? `Booking blocked: missing ${bookingNode.details.missing.join(", ")}.`
          : bookingNode?.summary ?? "Booking blocked."
      : `Booked for ${bookingNode?.details?.destination ?? goal} within budget ${bookingNode?.details?.budget ?? budget}.`
    : "";
  // Prefer the planning agent note; only fall back to booking message if none.
  agentNote = agentNote || agentMessageFromBooking;

  // On success, supersede older blocked bookings for same destination
  if (!bookingBlocked) {
    const supersede: Patch[] = [];
    Object.entries(engine.snapshot.raw ?? {}).forEach(([id, node]) => {
      if (id === bookingId) return;
      if (!id.startsWith("booking-")) return;
      const destination = (node as any)?.details?.destination;
      if (destination !== goal) return;
      if ((node as any)?.status !== "blocked") return;
      supersede.push({
        op: "replace",
        path: `/raw/${id}`,
        value: { ...(node as any), status: "resolved", summary: `Superseded by ${bookingId}`, dirty: false, updatedAt: new Date().toISOString() }
      });
      if (engine.snapshot.summary?.[id]) {
        supersede.push({
          op: "replace",
          path: `/summary/${id}`,
          value: `Booking ${id} superseded by ${bookingId}`
        });
      }
    });
    if (supersede.length > 0) {
      applyStep(supersede, "Supersede old bookings");
    }
  }

  // Refresh agent-note on booking outcome
  const notePatch: Patch = {
    op: engine.snapshot.summary?.["agent-note"] ? "replace" : "add",
    path: "/summary/agent-note",
    value: agentNote || agentMessageFromBooking || "Booking resolved."
  };
  applyStep([notePatch], bookingBlocked ? "Update agent note (blocked)" : "Refresh agent note");
  agentNote = engine.snapshot.summary?.["agent-note"];

  const planSummary = planMessages?.join("\n") ?? planPatches?.map(describePatch).join("\n");
  const resolvedAgentMessage = agentNote && agentNote !== "Agent note: pending" ? agentNote : agentMessageFromBooking;

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

