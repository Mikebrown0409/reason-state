import { ReasonState } from "../../src/engine/ReasonState.js";
import type { EchoState, Patch, ReasonStateOptions } from "../../src/engine/types.js";
import { grokPlanWithContext, type GrokPlanResult } from "../../src/tools/grokChat.js";
import { mockBooking } from "../../src/tools/mockBooking.js";
import { buildRollbackPatches } from "../../src/engine/reconciliation.js";
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
  rollbackNodeId?: string;
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
    return {
      history,
      events,
      planMetaHistory,
      checkpoints,
      agentMessage: "Blocked: unknown or dirty nodes present.",
    };
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
        details: { destination: goal, budget },
      },
    },
    {
      op: engine.snapshot.raw["goal"] ? "replace" : "add",
      path: "/summary/goal",
      value: `Goal: ${goal}`,
    },
    {
      op: engine.snapshot.raw["budget"] ? "replace" : "add",
      path: "/raw/budget",
      value: { id: "budget", type: "fact", details: { amount: budget } },
    },
    {
      op: engine.snapshot.raw["budget"] ? "replace" : "add",
      path: "/summary/budget",
      value: `Budget: ${budget}`,
    },
    {
      op: engine.snapshot.summary?.["agent-note"] ? "replace" : "add",
      path: "/summary/agent-note",
      value: "Agent note: pending",
    },
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
        sourceType: a.sourceType ?? "user",
      },
    }));
    await applyStep(inject, `Injected assumptions (${inject.length})`);
  }

  // Research X (optional)
  if (options.useX) {
    if (!engine.canExecute("action")) {
      events.push("Research skipped: blocked by governance (unknown/dirty)");
    } else {
      try {
        const xPatches = await xSearch(options.xQuery ?? goal);
        if (xPatches.length > 0) await applyStep(xPatches, "Research X");
      } catch (err) {
        events.push(`X error: ${String(err)}`);
      }
    }
  }

  // Plan with Grok (multi-turn if blockers)
  let planPatches: Patch[] | undefined;
  let planMeta: Omit<GrokPlanResult, "patches"> | undefined;
  let planMessages: string[] | undefined;
  let agentNote: string | undefined;
  const hasBlockersNow = () =>
    (engine.snapshot.unknowns?.length ?? 0) > 0 ||
    Object.values(engine.snapshot.raw ?? {}).some((n) => n.dirty);

  async function runPlanTurn(label: string, prompt: string) {
    try {
      const planRes = await grokPlanWithContext(engine.snapshot, prompt);
      planMetaHistory.push({
        attempts: planRes.attempts,
        lastError: planRes.lastError,
        raw: planRes.raw,
        label,
      });
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
    `Create a concise plan for: ${goal}, budget ${budget}. Consider existing booking summaries; avoid overlapping dates with blocked/resolved bookings. If clashes exist, ask for new dates. Reflect new facts/assumptions in /summary/agent-note (<=200 chars, summaries only; no details).`
  );

  // Optional rollback of a subtree before re-planning
  if (options.rollbackNodeId) {
    const rollbackPatches = buildRollbackPatches(engine.snapshot, options.rollbackNodeId);
    if (rollbackPatches.length > 0) {
      await applyStep(rollbackPatches, `Rollback subtree ${options.rollbackNodeId}`);
    }
  }

  if (!planPatches || hasBlockersNow()) {
    await runPlanTurn(
      "Plan turn 2 (resolve blockers)",
      `Resolve blockers/unknowns and refine plan for: ${goal}, budget ${budget}. Avoid overlapping dates with existing bookings; if clash, ask for new dates. Reflect new facts/assumptions in /summary/agent-note (<=200 chars, summaries only; no details).`
    );
  }

  // Fallback: if Grok didn't refresh agent-note, surface the latest injected facts so the UI reflects them.
  if (
    (!agentNote || agentNote === "Agent note: pending") &&
    injectedAssumptions &&
    injectedAssumptions.length > 0
  ) {
    const factsText = injectedAssumptions.map((f) => f.summary).join("; ");
    const notePatch: Patch = {
      op: engine.snapshot.summary?.["agent-note"] ? "replace" : "add",
      path: "/summary/agent-note",
      value: `Updated with new facts: ${factsText}`,
    };
    await applyStep([notePatch], "Agent note fallback (facts)");
    agentNote = engine.snapshot.summary?.["agent-note"];
  }

  // Resolve date unknowns if dates provided (auto-remediate)
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
            dirty: false,
          },
        });
      });
    if (resolveUnknowns.length > 0) {
      await applyStep(resolveUnknowns, "Resolve missing dates");
    }
  }

  // If dates are missing, short-circuit booking and prompt
  if (!options.bookingDates?.startDate || !options.bookingDates?.endDate) {
    const notePatch: Patch = {
      op: engine.snapshot.summary?.["agent-note"] ? "replace" : "add",
      path: "/summary/agent-note",
      value: "Need start/end dates to proceed with booking.",
    };
    await applyStep([notePatch], "Booking skipped (dates missing)");
    return {
      history,
      events,
      plan: planMessages?.join("\n") ?? planPatches?.map(describePatch).join("\n"),
      planPatches,
      planMeta,
      planMetaHistory,
      checkpoints,
      agentMessage: "Need start/end dates to proceed with booking.",
    };
  }

  // Book (reuse existing booking node when same destination/budget)
  if (!engine.canExecute("action")) {
    events.push("Booking skipped: blocked by governance (unknown/dirty)");
  } else {
    const existingBookingId = Object.keys(engine.snapshot.raw ?? {}).find((id) =>
      id.startsWith("booking-")
    );
    const reuseExisting =
      existingBookingId &&
      (engine.snapshot.raw[existingBookingId]?.details as any)?.destination === goal &&
      (engine.snapshot.raw[existingBookingId]?.details as any)?.budget === budget;
    const bookingId = reuseExisting
      ? existingBookingId!
      : `booking-${goal}-${options.bookingDates?.startDate ?? "nodates"}-${options.bookingDates?.endDate ?? "nodates"}`;

    const bookingPatches = await mockBooking({
      id: bookingId,
      destination: goal,
      budget,
      unknowns: engine.snapshot.unknowns,
      startDate: options.bookingDates?.startDate,
      endDate: options.bookingDates?.endDate,
    });
    const bookingBlocked =
      bookingPatches[0]?.value && (bookingPatches[0].value as any).status === "blocked";
    await applyStep(bookingPatches, bookingBlocked ? "Booking blocked" : "Booking placed");

    // If blocked by clash, keep node clean and surface actionable note
    if (bookingBlocked && (bookingPatches[0]?.value as any)?.details?.conflict) {
      const clashMessage = `Booking blocked: dates clash (${(bookingPatches[0]?.value as any)?.details?.conflict?.startDate}–${(bookingPatches[0]?.value as any)?.details?.conflict?.endDate}). Try new dates.`;
      agentNote = clashMessage;
      const clashPatch: Patch = {
        op: "replace",
        path: `/raw/${bookingId}`,
        value: { ...(bookingPatches[0]?.value as any), dirty: false },
      };
      await applyStep([clashPatch], "Mark clash clean");
      const notePatch: Patch = {
        op: engine.snapshot.summary?.["agent-note"] ? "replace" : "add",
        path: "/summary/agent-note",
        value: clashMessage,
      };
      await applyStep([notePatch], "Update agent note (clash)");
    }

    // Refresh agent note on success to avoid stale guidance
    if (!bookingBlocked) {
      agentNote =
        (bookingPatches[0]?.value as any)?.summary ?? `Booked for ${goal} within budget ${budget}.`;
      const notePatch: Patch = {
        op: engine.snapshot.summary?.["agent-note"] ? "replace" : "add",
        path: "/summary/agent-note",
        value:
          (bookingPatches[0]?.value as any)?.summary ??
          `Booked for ${goal} within budget ${budget}.`,
      };
      await applyStep([notePatch], "Refresh agent note");

      // Supersede older blocked bookings for the same destination so they no longer count as blockers
      const supersedePatches: Patch[] = [];
      Object.entries(engine.snapshot.raw ?? {}).forEach(([id, node]) => {
        if (id === bookingId) return;
        if (!id.startsWith("booking-")) return;
        const destination = (node as any)?.details?.destination;
        if (destination !== goal) return;
        if ((node as any)?.status !== "blocked") return;
        supersedePatches.push({
          op: "replace",
          path: `/raw/${id}`,
          value: {
            ...(node as any),
            status: "resolved",
            summary: `Superseded by ${bookingId}`,
            dirty: false,
            updatedAt: new Date().toISOString(),
          },
        });
        if (engine.snapshot.summary?.[id]) {
          supersedePatches.push({
            op: "replace",
            path: `/summary/${id}`,
            value: `Booking ${id} superseded by ${bookingId}`,
          });
        }
      });
      if (supersedePatches.length > 0) {
        await applyStep(supersedePatches, "Supersede old bookings");
      }
    }
  }

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
          sourceId: "dag-contradiction",
        }
      : {
          id: contradictionId,
          type: "planning",
          status: "open",
          summary: "Conflicting plan (no goal present)",
          contradicts: ["goal"],
          sourceType: "agent",
          sourceId: "dag-contradiction",
        };
    const contradictionPatch: Patch = {
      op: "add",
      path: `/raw/${contradictionId}`,
      value: contradictory,
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
  const agentMessage = engine.snapshot.summary?.["agent-note"] ?? planMessages?.join(" | ") ?? "";

  const planSummary = planMessages?.join("\n") ?? planPatches?.map(describePatch).join("\n");

  return {
    history,
    events,
    plan: planSummary,
    planPatches,
    planMeta,
    planMetaHistory,
    checkpoints,
    agentMessage: agentNote ?? agentMessage,
  };
}
