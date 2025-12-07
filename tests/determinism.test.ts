import { describe, it, expect } from "vitest";
import { applyPatches, replayHistory } from "../src/engine/ReasonState.js";
import { saveCheckpoint, loadCheckpoint } from "../src/engine/storage.js";
import { createEmptyState, type EchoState, type Patch } from "../src/engine/types.js";

describe("determinism", () => {
  it("replays and checkpoint/restores deterministically", async () => {
    const start: EchoState = createEmptyState();
    const log: Patch[] = [
      { op: "add", path: "/raw/f1", value: { id: "f1", type: "fact", summary: "A fact" } },
      { op: "add", path: "/summary/f1", value: "A fact" }
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
});

