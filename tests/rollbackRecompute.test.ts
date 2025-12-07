import { describe, it, expect } from "vitest";
import { ReasonState, applyPatches } from "../src/engine/ReasonState.js";
import { buildRollbackPatches } from "../src/engine/reconciliation.js";
import { mockBooking } from "../src/tools/mockBooking.js";
import type { Patch } from "../src/engine/types.js";

describe("rollback and recompute subtree", () => {
  it("rolls back a blocked booking subtree and recomputes with provided dates deterministically", async () => {
    const engine = new ReasonState();

    // Seed goal/budget and blocked booking (missing dates)
    const seed: Patch[] = [
      {
        op: "add",
        path: "/raw/goal",
        value: { id: "goal", type: "planning", summary: "Plan for Tokyo", details: { destination: "Tokyo", budget: 4000 } }
      },
      { op: "add", path: "/summary/goal", value: "Goal: Tokyo" },
      { op: "add", path: "/raw/budget", value: { id: "budget", type: "fact", details: { amount: 4000 } } }
    ];
    engine.applyPatches(seed);

    const baseId = "1";
    const bookingId = `booking-${baseId}`;
    const blocked = await mockBooking({
      id: baseId,
      destination: "Tokyo",
      budget: 4000,
      unknowns: engine.snapshot.unknowns
    });
    engine.applyPatches(blocked);

    const beforeHistory = engine.snapshot.history.length;

    // Rollback subtree rooted at booking-1
    const rollback = buildRollbackPatches(engine.snapshot, bookingId);
    engine.applyPatches(rollback);

  // Resolve missing dates unknown
  const unknownId = engine.snapshot.unknowns[0];
  if (unknownId) {
    engine.applyPatches([
      {
        op: "replace",
        path: `/raw/${unknownId}`,
        value: {
          ...(engine.snapshot.raw[unknownId] as any),
          status: "resolved",
          summary: "Dates provided",
          details: { ...(engine.snapshot.raw[unknownId].details as any), resolvedAt: new Date().toISOString() },
          dirty: false
        }
      }
    ]);
  }

    // Provide dates and re-run booking with same id (replace-in-place)
    const resolved = await mockBooking({
      id: baseId,
      destination: "Tokyo",
      budget: 4000,
      startDate: "2025-12-10",
      endDate: "2025-12-12",
      unknowns: engine.snapshot.unknowns
    });
    engine.applyPatches(resolved);

  console.log("raw keys", Object.keys(engine.snapshot.raw));

    const booking = engine.snapshot.raw[bookingId];
    expect(booking?.status).toBe("resolved");
    expect(engine.snapshot.unknowns.length).toBe(0);

    // Replay deterministically
    const replayed = applyPatches(engine.snapshot.history ?? [], new ReasonState().snapshot);
    expect(replayed.raw["booking-1"]?.status).toBe("resolved");
    expect(replayed.history.length).toBe(engine.snapshot.history.length);

    // Ensure history grew through rollback + recompute
    expect(engine.snapshot.history.length).toBeGreaterThan(beforeHistory);
  });
});


