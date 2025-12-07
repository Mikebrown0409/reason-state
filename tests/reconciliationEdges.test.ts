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

  it("detects contradicts edge without details and marks dirty", () => {
    const state = createEmptyState();
    const next = applyPatches(
      [
        { op: "add", path: "/raw/a", value: { id: "a", type: "fact", summary: "a", contradicts: ["b"] } },
        { op: "add", path: "/raw/b", value: { id: "b", type: "fact", summary: "b" } }
      ],
      state
    );
    expect(next.raw.a.dirty).toBe(true);
    expect(next.raw.b.dirty).toBe(true);
  });
});


