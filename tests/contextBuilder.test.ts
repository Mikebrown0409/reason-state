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
        sourceId: "input-1",
      },
      factA: { id: "factA", type: "fact", summary: "Has rail pass" },
      factB: { id: "factB", type: "fact", summary: "Budget 4k", dirty: true },
      unknown1: { id: "u1", type: "unknown", summary: "Dates missing" },
    },
    summary: {},
    history: [
      { op: "add", path: "/raw/goal" },
      { op: "add", path: "/raw/factA" },
      { op: "add", path: "/raw/factB" },
      { op: "add", path: "/raw/unknown1" },
    ],
    unknowns: ["u1"],
    assumptions: [],
    checkpointId: undefined,
  };
}

describe("buildContext", () => {
  it("is deterministic and sorted by id within a bucket", () => {
    const state = makeState();
    const ctx1 = buildContext(state, {
      includeTimeline: false,
      buckets: [{ label: "Facts", nodeTypes: ["fact"] }],
    });
    const ctx2 = buildContext(state, {
      includeTimeline: false,
      buckets: [{ label: "Facts", nodeTypes: ["fact"] }],
    });
    expect(ctx1).toBe(ctx2);
    const factsSection = ctx1.split("\n").filter((l) => l.startsWith("- fact"));
    // Dirty fact should come first
    expect(factsSection[0]).toContain("factB");
    expect(factsSection[1]).toContain("factA");
  });

  it("respects topK in buckets", () => {
    const state = makeState();
    const ctx = buildContext(state, {
      includeTimeline: false,
      buckets: [{ label: "Facts", nodeTypes: ["fact"], topK: 1 }],
    });
    expect(ctx).toContain("factB"); // dirty fact prioritized
    expect(ctx).not.toContain("factA");
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

  it("prioritizes dirty, then assumptions, then unknowns, then facts", () => {
    const state = makeState();
    state.raw.assump = {
      id: "assump",
      type: "assumption",
      summary: "maybe",
      assumptionStatus: "valid",
    };
    state.raw.factB.dirty = true;
    state.raw.u2 = { id: "u2", type: "unknown", summary: "need dates 2" };
    const ctx = buildContext(state, {
      includeTimeline: false,
      buckets: [{ label: "All", nodeTypes: ["fact", "assumption", "unknown"] }],
    });
    const lines = ctx.split("\n").filter((l) => l.startsWith("-"));
    expect(lines[0]).toContain("factB"); // dirty first
    expect(lines[1]).toContain("assump"); // then assumption
    // unknowns after assumptions
    expect(lines.slice(2).some((l) => l.includes("u1"))).toBe(true);
    expect(lines.slice(2).some((l) => l.includes("u2"))).toBe(true);
  });

  it("is deterministic under truncation", () => {
    const state = makeState();
    const ctx1 = buildContext(state, { maxChars: 80 });
    const ctx2 = buildContext(state, { maxChars: 80 });
    expect(ctx1).toBe(ctx2);
    expect(ctx1.length).toBeLessThanOrEqual(80);
  });

  it("honors custom buckets and timeline tail together", () => {
    const state = makeState();
    const ctx = buildContext(state, {
      buckets: [{ label: "Only facts", nodeTypes: ["fact"] }],
      includeTimeline: true,
      timelineTail: 1,
    });
    expect(ctx).toContain("## Only facts");
    expect(ctx).toContain("factA");
    expect(ctx).not.toContain("goal");
    // timeline should include only the last entry
    const timelineLines = ctx.split("\n").filter((l) => l.startsWith("- 0:"));
    expect(timelineLines.length).toBe(1);
    expect(timelineLines[0]).toContain("/raw/unknown1");
  });
});
