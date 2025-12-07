import { describe, it, expect } from "vitest";
import { applyPatches } from "../src/engine/ReasonState.js";
import { createEmptyState } from "../src/engine/types.js";

describe("timestamps", () => {
  it("sets createdAt/updatedAt on add and updates updatedAt on replace", () => {
    const state = createEmptyState();
    const added = applyPatches(
      [{ op: "add", path: "/raw/t1", value: { id: "t1", type: "fact", summary: "hello" } }],
      state
    );
    const created = added.raw.t1.createdAt;
    const updated1 = added.raw.t1.updatedAt;
    expect(created).toBeDefined();
    expect(updated1).toBeDefined();

    const replaced = applyPatches(
      [
        {
          op: "replace",
          path: "/raw/t1",
          value: { id: "t1", type: "fact", summary: "updated" }
        }
      ],
      added
    );
    expect(replaced.raw.t1.createdAt).toBe(created);
    expect(replaced.raw.t1.updatedAt).not.toBe(updated1);
  });
});


