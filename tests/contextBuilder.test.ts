import { describe, it, expect } from "vitest";
import { buildContext } from "../src/context/contextBuilder.js";
import type { EchoState } from "../src/engine/types.js";

function makeState(): EchoState {
  return {
    raw: {
      goal: {
        id: "goal",
        type: "planning",
        summary: "Plan Tokyo",
        details: { destination: "Tokyo" },
        sourceType: "user",
        sourceId: "input-1"
      },
      factA: { id: "factA", type: "fact", summary: "Has rail pass" },
      factB: { id: "factB", type: "fact", summary: "Budget 4k", dirty: true },
      unknown1: { id: "u1", type: "unknown", summary: "Dates missing" }
    },
    summary: {},
    history: [
      { op: "add", path: "/raw/goal" },
      { op: "add", path: "/raw/factA" },
      { op: "add", path: "/raw/factB" },
      { op: "add", path: "/raw/unknown1" }
    ],
    unknowns: ["u1"],
    edges: {},
    checkpointId: undefined
  };
}

describe("buildContext", () => {
  it("is deterministic and sorted by id within a bucket", () => {
    const state = makeState();
    const ctx1 = buildContext(state, { includeTimeline: false, buckets: [{ label: "Facts", nodeTypes: ["fact"] }] });
    const ctx2 = buildContext(state, { includeTimeline: false, buckets: [{ label: "Facts", nodeTypes: ["fact"] }] });
    expect(ctx1).toBe(ctx2);
    const factsSection = ctx1.split("\n").filter((l) => l.startsWith("- fact"));
    expect(factsSection[0]).toContain("factA");
    expect(factsSection[1]).toContain("factB");
  });

  it("respects topK in buckets", () => {
    const state = makeState();
    const ctx = buildContext(state, {
      includeTimeline: false,
      buckets: [{ label: "Facts", nodeTypes: ["fact"], topK: 1 }]
    });
    expect(ctx).toContain("factA");
    expect(ctx).not.toContain("factB");
  });

  it("truncates to maxChars", () => {
    const state = makeState();
    const ctx = buildContext(state, { maxChars: 50, includeTimeline: false });
    expect(ctx.length).toBeLessThanOrEqual(50);
  });

  it("includes only the tail of the timeline", () => {
    const state = makeState();
    const ctx = buildContext(state, { includeTimeline: true, timelineTail: 2 });
    expect(ctx).toContain("- 0: add /raw/factB"); // last two entries indices reset in slice
    expect(ctx).toContain("- 1: add /raw/unknown1");
    expect(ctx).not.toContain("/raw/goal");
  });

  it("does not leak details into context", () => {
    const state = makeState();
    const ctx = buildContext(state);
    expect(ctx).not.toContain("destination");
  });
});


