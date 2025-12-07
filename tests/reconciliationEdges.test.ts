import { describe, expect, it } from "vitest";
import { applyPatches } from "../src/engine/ReasonState.js";
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
          value: { id: "child", type: "action", summary: "needs base", dependsOn: ["base"] }
        },
        {
          op: "add",
          path: "/raw/conflict",
          value: { id: "conflict", type: "fact", contradicts: ["base"], summary: "contradiction" }
        }
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
          value: { id: "step2", type: "action", summary: "second", temporalBefore: ["step1"] }
        }
      ],
      state
    );
    expect(withTemporal.raw.step2.status).toBe("blocked");
    const resolved = applyPatches(
      [{ op: "replace", path: "/raw/step1", value: { id: "step1", type: "fact", summary: "first", status: "resolved" } }],
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
          value: { id: "child", type: "action", summary: "needs base", dependsOn: ["base"] }
        }
      ],
      state
    );
    // Mark base dirty/blocked via contradiction
    const blocked = applyPatches(
      [{ op: "add", path: "/raw/conflict", value: { id: "conflict", type: "fact", contradicts: ["base"] } }],
      withDep
    );
    expect(blocked.raw.child.status).toBe("blocked");
    // Resolve base -> child should open
    const resolved = applyPatches(
      [{ op: "replace", path: "/raw/base", value: { id: "base", type: "fact", status: "resolved" } }],
      blocked
    );
    expect(resolved.raw.child.status).toBe("open");
  });

  it("detects contradicts edge without details and marks dirty", () => {
    const state = createEmptyState();
    const next = applyPatches(
      [
        { op: "add", path: "/raw/a", value: { id: "a", type: "fact", summary: "a", contradicts: ["b"] } },
        { op: "add", path: "/raw/b", value: { id: "b", type: "fact", summary: "b" } }
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
});


