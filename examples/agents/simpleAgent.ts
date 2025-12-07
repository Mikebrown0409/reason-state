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
  let planMessages: string[] | undefined;

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
    `Create a concise plan for: ${query}, budget ${budget}. Consider existing booking summaries; do not overlap dates with blocked/resolved bookings. If clashes exist, ask for new dates. Reflect new facts/assumptions in /summary/agent-note (<=200 chars, summaries only; no details).`
  );

  // If governance blockers remain (unknowns/dirty) or no patches, attempt a second turn focused on blockers
  const hasBlockers = (engine.snapshot.unknowns?.length ?? 0) > 0 || Object.values(engine.snapshot.raw ?? {}).some((n) => n.dirty);
  if (!planPatches || hasBlockers) {
    await runPlanTurn(
      "Plan turn 2 (resolve blockers)",
      `Resolve blockers/unknowns and refine plan for: ${query}, budget ${budget}. Prioritize clearing unknowns/dirty nodes and avoid date clashes with existing bookings. Reflect new facts/assumptions in /summary/agent-note (<=200 chars, summaries only; no details).`
    );
  }

  // Fallback: if Grok didn't refresh agent-note, surface the latest injected facts so the UI reflects them.
  if ((!agentNote || agentNote === "Agent note: pending") && injectedFacts && injectedFacts.length > 0) {
    const factsText = injectedFacts.map((f) => f.summary).join("; ");
    const notePatch: Patch = {
      op: engine.snapshot.summary?.["agent-note"] ? "replace" : "add",
      path: "/summary/agent-note",
      value: `Updated with new facts: ${factsText}`
    };
    applyStep([notePatch], "Agent note fallback (facts)");
    agentNote = engine.snapshot.summary?.["agent-note"];
  }

  // Resolve date-related unknowns if user provided dates (auto-remediate)
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

  // If dates are missing, short-circuit booking and prompt
  if (!options.bookingDates?.startDate || !options.bookingDates?.endDate) {
    const notePatch: Patch = {
      op: engine.snapshot.summary?.["agent-note"] ? "replace" : "add",
      path: "/summary/agent-note",
      value: "Need start/end dates to proceed with booking."
    };
    applyStep([notePatch], "Booking skipped (dates missing)");
    return {
      history,
      events,
      plan: planSummaries.join("\n---\n"),
      planPatches,
      planMeta,
      planMetaHistory,
      planMessages,
      agentMessage: "Need start/end dates to proceed with booking."
    };
  }

  // Identify existing booking to reuse/replace
  const existingBookingId = Object.keys(engine.snapshot.raw ?? {}).find((id) => id.startsWith("booking-"));
  const reuseExisting =
    existingBookingId &&
    (engine.snapshot.raw[existingBookingId]?.details as any)?.destination === query &&
    (engine.snapshot.raw[existingBookingId]?.details as any)?.budget === budget;
  const bookingId = reuseExisting ? existingBookingId! : `booking-${query}-${options.bookingDates?.startDate ?? "nodates"}-${options.bookingDates?.endDate ?? "nodates"}`;

  // Booking (governed)
  if (!engine.canExecute("action")) {
    // As a fallback, try to auto-resolve dates if provided
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
    if (!engine.canExecute("action")) {
      events.push("Booking skipped: blocked by governance (unknown/dirty)");
      return {
        history,
        events,
        plan: planSummaries.join("\n---\n"),
        planPatches,
        planMeta,
        planMetaHistory,
        planMessages,
        agentMessage: agentNote && agentNote !== "Agent note: pending" ? agentNote : ""
      };
    }
  }
  const bookingPatches = await mockBooking({
    id: bookingId,
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

  // If blocked by clash, keep node clean and surface actionable note
  if (bookingBlocked && bookingNode?.details?.conflict) {
    agentNote = agentMessageFromBooking;
    const clashPatch: Patch = {
      op: "replace",
      path: `/raw/${bookingId}`,
      value: { ...(bookingNode as any), dirty: false }
    };
    applyStep([clashPatch], "Mark clash clean");
    const notePatch: Patch = {
      op: engine.snapshot.summary?.["agent-note"] ? "replace" : "add",
      path: "/summary/agent-note",
      value: agentMessageFromBooking
    };
    applyStep([notePatch], "Update agent note (clash)");
  }

  // Refresh agent-note on booking success to avoid stale guidance.
  if (!bookingBlocked) {
    agentNote = agentMessageFromBooking;
    const notePatch: Patch = {
      op: engine.snapshot.summary?.["agent-note"] ? "replace" : "add",
      path: "/summary/agent-note",
      value: agentMessageFromBooking || "Booking resolved."
    };
    applyStep([notePatch], "Refresh agent note");

    // Supersede older blocked bookings for the same destination so they no longer count as blockers
    const supersedePatches: Patch[] = [];
    Object.entries(engine.snapshot.raw ?? {}).forEach(([id, node]) => {
      if (id === bookingId) return;
      if (!id.startsWith("booking-")) return;
      const destination = (node as any)?.details?.destination;
      if (destination !== query) return;
      if ((node as any)?.status !== "blocked") return;
      supersedePatches.push({
        op: "replace",
        path: `/raw/${id}`,
        value: {
          ...(node as any),
          status: "resolved",
          summary: `Superseded by ${bookingId}`,
          dirty: false,
          updatedAt: new Date().toISOString()
        }
      });
      if (engine.snapshot.summary?.[id]) {
        supersedePatches.push({
          op: "replace",
          path: `/summary/${id}`,
          value: `Booking ${id} superseded by ${bookingId}`
        });
      }
    });
    if (supersedePatches.length > 0) {
      applyStep(supersedePatches, "Supersede old bookings");
    }
  }

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

