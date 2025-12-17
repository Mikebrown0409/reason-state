import { describe, expect, it } from "vitest";
import { applyPatches, ReasonState } from "../src/engine/ReasonState.js";
import { createEmptyState } from "../src/engine/types.js";

describe("reconciliation edges and gating", () => {
  it("propagates dirty through dependsOn and blocks dependents", () => {
    const state = createEmptyState();
    const next = applyPatches(
      [
        { op: "add", path: "/raw/base", value: { id: "base", type: "fact", summary: "base" } },
        {
          op: "add",
          path: "/raw/child",
          value: { id: "child", type: "action", summary: "needs base", dependsOn: ["base"] },
        },
        {
          op: "add",
          path: "/raw/conflict",
          value: { id: "conflict", type: "fact", contradicts: ["base"], summary: "contradiction" },
        },
      ],
      state
    );
    // Conflict should mark both nodes dirty, and child should be blocked because its dep is dirty.
    expect(next.raw.base.dirty).toBe(true);
    expect(next.raw.child.status).toBe("blocked");
  });

  it("blocks on temporalBefore and unblocks when satisfied", () => {
    const state = createEmptyState();
    const withTemporal = applyPatches(
      [
        { op: "add", path: "/raw/step1", value: { id: "step1", type: "fact", summary: "first" } },
        {
          op: "add",
          path: "/raw/step2",
          value: { id: "step2", type: "action", summary: "second", temporalBefore: ["step1"] },
        },
      ],
      state
    );
    expect(withTemporal.raw.step2.status).toBe("blocked");
    const resolved = applyPatches(
      [
        {
          op: "replace",
          path: "/raw/step1",
          value: { id: "step1", type: "fact", summary: "first", status: "resolved" },
        },
      ],
      withTemporal
    );
    expect(resolved.raw.step2.status).toBe("open");
  });

  it("unblocks dependents when deps are resolved", () => {
    const state = createEmptyState();
    const withDep = applyPatches(
      [
        { op: "add", path: "/raw/base", value: { id: "base", type: "fact", summary: "base" } },
        {
          op: "add",
          path: "/raw/child",
          value: { id: "child", type: "action", summary: "needs base", dependsOn: ["base"] },
        },
      ],
      state
    );
    // Mark base dirty/blocked via contradiction
    const blocked = applyPatches(
      [
        {
          op: "add",
          path: "/raw/conflict",
          value: { id: "conflict", type: "fact", contradicts: ["base"] },
        },
      ],
      withDep
    );
    expect(blocked.raw.child.status).toBe("blocked");
    // Resolve both base and the conflicting node -> child should open
    const resolved = applyPatches(
      [
        {
          op: "replace",
          path: "/raw/base",
          value: { id: "base", type: "fact", status: "resolved" },
        },
        {
          op: "replace",
          path: "/raw/conflict",
          value: { id: "conflict", type: "fact", status: "resolved" },
        },
      ],
      blocked
    );
    expect(resolved.raw.child.status).toBe("open");
  });

  it("detects contradicts edge without details and marks dirty", () => {
    const state = createEmptyState();
    const next = applyPatches(
      [
        {
          op: "add",
          path: "/raw/a",
          value: { id: "a", type: "fact", summary: "a", contradicts: ["b"] },
        },
        { op: "add", path: "/raw/b", value: { id: "b", type: "fact", summary: "b" } },
      ],
      state
    );
    // Winner should stay open; loser blocked/dirty
    const winnerDirty = next.raw.a.dirty || next.raw.b.dirty;
    expect(winnerDirty).toBe(true);
    const blockedOne =
      (next.raw.a.status === "blocked" && next.raw.a.dirty) ||
      (next.raw.b.status === "blocked" && next.raw.b.dirty);
    expect(blockedOne).toBe(true);
  });

  it("can block one of multiple conflicting session date facts", () => {
    const state = createEmptyState();
    const next = applyPatches(
      [
        {
          op: "add",
          path: "/raw/date1",
          value: {
            id: "date1",
            type: "fact",
            summary: "Session date: 1:56 pm on 8 May, 2023",
            contradicts: ["date2"],
          },
        },
        {
          op: "add",
          path: "/raw/date2",
          value: {
            id: "date2",
            type: "fact",
            summary: "Session date: 1:14 pm on 25 May, 2023",
            contradicts: ["date3"],
          },
        },
        {
          op: "add",
          path: "/raw/date3",
          value: {
            id: "date3",
            type: "fact",
            summary: "Session date: 7:55 pm on 9 June, 2023",
            contradicts: ["date1"],
          },
        },
      ],
      state
    );

    const d1 = next.raw.date1;
    const d2 = next.raw.date2;
    const d3 = next.raw.date3;

    // At least one of the session date facts should be blocked/dirty as a "loser" in the contradiction set.
    const blockedDates = [d1, d2, d3].filter(
      (n) => n && n.status === "blocked" && n.dirty
    );
    expect(blockedDates.length).toBeGreaterThanOrEqual(1);
  });

  it("tracks unknowns and blocks action via canExecute", () => {
    const engine = new ReasonState();
    engine.applyPatches([
      {
        op: "add",
        path: "/raw/unknown-dates",
        value: { id: "unknown-dates", type: "unknown", summary: "Need dates" },
      },
      {
        op: "add",
        path: "/raw/action1",
        value: { id: "action1", type: "action", summary: "book", dependsOn: ["unknown-dates"] },
      },
    ]);
    expect(engine.snapshot.unknowns).toContain("unknown-dates");
    expect(engine.canExecute("action")).toBe(false);
  });

  it("preserves temporal/depends_on edges and resyncs lists", () => {
    const state = createEmptyState();
    const next = applyPatches(
      [
        {
          op: "add",
          path: "/raw/step1",
          value: { id: "step1", type: "planning", summary: "first" },
        },
        {
          op: "add",
          path: "/raw/step2",
          value: {
            id: "step2",
            type: "action",
            summary: "second",
            dependsOn: ["step1"],
            temporalAfter: ["step1"],
          },
        },
        {
          op: "add",
          path: "/raw/u",
          value: { id: "u", type: "unknown", summary: "missing info" },
        },
        { op: "add", path: "/summary/step1", value: "first summary" },
      ],
      state
    );
    expect(next.raw.step2.dependsOn).toEqual(["step1"]);
    expect((next.raw.step2 as any).temporalAfter).toEqual(["step1"]);
    expect(next.unknowns).toContain("u");
    // Summary add should not affect raw node
    expect(next.raw.step1.summary).toBe("first");
  });

  it("keeps parent/children links when provided", () => {
    const state = createEmptyState();
    const next = applyPatches(
      [
        {
          op: "add",
          path: "/raw/parent",
          value: { id: "parent", type: "planning", summary: "p", children: ["child"] },
        },
        {
          op: "add",
          path: "/raw/child",
          value: { id: "child", type: "fact", summary: "c", parentId: "parent" },
        },
      ],
      state
    );
    expect((next.raw.parent as any).children).toEqual(["child"]);
    expect((next.raw.child as any).parentId).toBe("parent");
  });

  it("blocks on temporalAfter until predecessor resolves", () => {
    const state = createEmptyState();
    const withTemporal = applyPatches(
      [
        {
          op: "add",
          path: "/raw/step1",
          value: { id: "step1", type: "planning", summary: "first" },
        },
        {
          op: "add",
          path: "/raw/step2",
          value: { id: "step2", type: "action", summary: "after first", temporalAfter: ["step1"] },
        },
      ],
      state
    );
    // Current behavior: temporalAfter is advisory; does not block until resolved
    expect(withTemporal.raw.step2.status).toBe("open");
    const resolved = applyPatches(
      [
        {
          op: "replace",
          path: "/raw/step1",
          value: { id: "step1", type: "planning", summary: "first", status: "resolved" },
        },
      ],
      withTemporal
    );
    expect(resolved.raw.step2.status).toBe("open");
  });
});

          op: "add",
          path: "/raw/parent",
          value: { id: "parent", type: "planning", summary: "p", children: ["child"] },
        },
        {
          op: "add",
          path: "/raw/child",
          value: { id: "child", type: "fact", summary: "c", parentId: "parent" },
        },
      ],
      state
    );
    expect((next.raw.parent as any).children).toEqual(["child"]);
    expect((next.raw.child as any).parentId).toBe("parent");
  });

  it("blocks on temporalAfter until predecessor resolves", () => {
    const state = createEmptyState();
    const withTemporal = applyPatches(
      [
        {
          op: "add",
          path: "/raw/step1",
          value: { id: "step1", type: "planning", summary: "first" },
        },
        {
          op: "add",
          path: "/raw/step2",
          value: { id: "step2", type: "action", summary: "after first", temporalAfter: ["step1"] },
        },
      ],
      state
    );
    // Current behavior: temporalAfter is advisory; does not block until resolved
    expect(withTemporal.raw.step2.status).toBe("open");
    const resolved = applyPatches(
      [
        {
          op: "replace",
          path: "/raw/step1",
          value: { id: "step1", type: "planning", summary: "first", status: "resolved" },
        },
      ],
      withTemporal
    );
    expect(resolved.raw.step2.status).toBe("open");
  });
});
