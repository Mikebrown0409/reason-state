import { describe, it, expect } from "vitest";
import { applyPatches, replayHistory, ReasonState } from "../src/engine/ReasonState.js";
import { saveCheckpoint, loadCheckpoint } from "../src/engine/storage.js";
import { createEmptyState, type EchoState, type Patch } from "../src/engine/types.js";

describe("determinism", () => {
  it("replays and checkpoint/restores deterministically", async () => {
    const start: EchoState = createEmptyState();
    const log: Patch[] = [
      { op: "add", path: "/raw/f1", value: { id: "f1", type: "fact", summary: "A fact" } },
      { op: "add", path: "/summary/f1", value: "A fact" },
    ];

    const after = applyPatches(log, start);
    console.log("applied patches", JSON.stringify(log, null, 2));
    console.log("state after apply", JSON.stringify(after.raw, null, 2));
    const cp = await saveCheckpoint(after);
    console.log("checkpoint saved", cp.id, "history length", after.history.length);

    const replayed = replayHistory(after.history, createEmptyState());
    console.log("replayed state", JSON.stringify(replayed.raw, null, 2));
    expect(replayed.raw).toEqual(after.raw);

    const loaded = await loadCheckpoint(cp.id);
    console.log("restored from checkpoint", JSON.stringify(loaded.state.raw, null, 2));
    expect(loaded.state.raw).toEqual(after.raw);
  });

  it("recompute preserves determinism and reuse counts stay stable", () => {
    const engine = new ReasonState();
    engine.applyPatches([
      { op: "add", path: "/raw/f1", value: { id: "f1", type: "fact", summary: "A" } },
      { op: "add", path: "/raw/f2", value: { id: "f2", type: "fact", summary: "B" } },
    ]);
    const before = JSON.parse(JSON.stringify(engine.snapshot.raw));
    engine.applyPatches([
      { op: "replace", path: "/raw/f2", value: { id: "f2", type: "fact", summary: "B updated" } },
    ]);
    const after = engine.snapshot.raw;

    const replayed = applyPatches(engine.snapshot.history ?? [], createEmptyState());
    expect(replayed.raw).toEqual(after);

    const ids = Object.keys(after);
    const reused = ids.filter((id) => JSON.stringify(after[id]) === JSON.stringify(before[id]));
    const regenerated = ids.filter((id) => !reused.includes(id));
    expect(reused).toContain("f1");
    expect(regenerated).toContain("f2");
    const reusePct = Math.round((reused.length / ids.length) * 100);
    expect(reusePct).toBe(50);
  });
});
