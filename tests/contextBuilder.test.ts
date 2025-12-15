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
      mode: "deterministic",
    });
    const ctx2 = buildContext(state, {
      includeTimeline: false,
      buckets: [{ label: "Facts", nodeTypes: ["fact"] }],
      mode: "deterministic",
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
      mode: "deterministic",
    });
    expect(ctx).toContain("factB"); // dirty fact prioritized
    expect(ctx).not.toContain("factA");
  });

  it("truncates to maxChars", () => {
    const state = makeState();
    const ctx = buildContext(state, {
      maxChars: 50,
      includeTimeline: false,
      mode: "deterministic",
    });
    expect(ctx.length).toBeLessThanOrEqual(50);
  });

  it("includes only the tail of the timeline", () => {
    const state = makeState();
    const ctx = buildContext(state, {
      includeTimeline: true,
      timelineTail: 2,
      mode: "deterministic",
    });
    expect(ctx).toContain("- 0: add /raw/factB"); // last two entries indices reset in slice
    expect(ctx).toContain("- 1: add /raw/unknown1");
    expect(ctx).not.toContain("/raw/goal");
  });

  it("does not leak details into context", () => {
    const state = makeState();
    const ctx = buildContext(state, { mode: "deterministic" });
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
      mode: "deterministic",
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
    const ctx1 = buildContext(state, { maxChars: 80, mode: "deterministic" });
    const ctx2 = buildContext(state, { maxChars: 80, mode: "deterministic" });
    expect(ctx1).toBe(ctx2);
    expect(ctx1.length).toBeLessThanOrEqual(80);
  });

  it("honors custom buckets and timeline tail together", () => {
    const state = makeState();
    const ctx = buildContext(state, {
      buckets: [{ label: "Only facts", nodeTypes: ["fact"] }],
      includeTimeline: true,
      timelineTail: 1,
      mode: "deterministic",
    });
    expect(ctx).toContain("## Only facts");
    expect(ctx).toContain("factA");
    expect(ctx).not.toContain("goal");
    // timeline should include only the last entry
    const timelineLines = ctx.split("\n").filter((l) => l.startsWith("- 0:"));
    expect(timelineLines.length).toBe(1);
    expect(timelineLines[0]).toContain("/raw/unknown1");
  });

  describe("balanced mode", () => {
    function makeLargeState(count = 30): EchoState {
      const raw: EchoState["raw"] = {
        goal: {
          id: "goal",
          type: "planning",
          summary: "Main goal",
          sourceType: "user",
          sourceId: "input-1",
          updatedAt: "2025-01-01T00:00:00.000Z",
        },
        blocker: { id: "blocker", type: "unknown", summary: "Need dates" },
      };
      const history: NonNullable<EchoState["history"]> = [];
      for (let i = 0; i < count; i++) {
        const id = `fact-${i}`;
        raw[id] = {
          id,
          type: "fact",
          summary: `Fact ${i}`,
          updatedAt: `2025-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
        };
        history.push({ op: "add", path: `/raw/${id}` });
      }
      history.push({ op: "add", path: "/raw/blocker" });
      return { raw, summary: {}, history, unknowns: ["blocker"], assumptions: [] };
    }

    it("honors maxChars and keeps blockers, goals, and recency", () => {
      const state = makeLargeState(40);
      const ctx = buildContext(state, { mode: "balanced", maxChars: 400, includeTimeline: false });
      expect(ctx.length).toBeLessThanOrEqual(400);
      expect(ctx).toContain("blocker");
      expect(ctx).toContain("goal");
      // latest fact should appear due to recency
      expect(ctx).toMatch(/fact-3\d/);
    });

    it("summarizes overflow when bucket is too large", () => {
      const raw: EchoState["raw"] = {
        goal: { id: "goal", type: "planning", summary: "Main goal" },
      };
      for (let i = 0; i < 40; i++) {
        raw[`fact-${i}`] = { id: `fact-${i}`, type: "fact", summary: `Fact ${i}` };
      }
      const state: EchoState = {
        raw,
        summary: {},
        history: [],
        unknowns: [],
        assumptions: [],
      };
      const ctx = buildContext(state, { mode: "balanced", maxChars: 200, includeTimeline: false });
      expect(ctx.includes("... (")).toBe(true);
    });

    it("is deterministic under truncation in balanced mode", () => {
      const state = makeLargeState(50);
      const ctx1 = buildContext(state, { mode: "balanced", maxChars: 200, includeTimeline: false });
      const ctx2 = buildContext(state, { mode: "balanced", maxChars: 200, includeTimeline: false });
      expect(ctx1).toBe(ctx2);
      expect(ctx1.length).toBeLessThanOrEqual(200);
    });

    it("respects budget when adding timeline", () => {
      const state = makeLargeState(10);
      const ctx = buildContext(state, {
        mode: "balanced",
        maxChars: 180,
        includeTimeline: true,
        timelineTail: 3,
      });
      expect(ctx.length).toBeLessThanOrEqual(180);
    });
  });

  describe("token efficiency (goal-relevance and caps)", () => {
    function makeGraphWithDeps(): EchoState {
      // Create a graph with goal → dep1 → dep2 and unrelated nodes
      return {
        raw: {
          goal: {
            id: "goal",
            type: "planning",
            summary: "Book Tokyo trip",
            dependsOn: ["dep1"],
          },
          dep1: {
            id: "dep1",
            type: "fact",
            summary: "User wants Tokyo",
            dependsOn: ["dep2"],
          },
          dep2: {
            id: "dep2",
            type: "assumption",
            summary: "Budget is 5000",
          },
          unrelated1: {
            id: "unrelated1",
            type: "fact",
            summary: "Random fact 1",
          },
          unrelated2: {
            id: "unrelated2",
            type: "fact",
            summary: "Random fact 2",
          },
        },
        summary: {},
        history: [],
        unknowns: [],
        assumptions: [],
      };
    }

    it("collectDepsForGoal finds upstream dependencies (bidirectional)", () => {
      const state = makeGraphWithDeps();
      const ctx = buildContext(state, {
        mode: "balanced",
        maxChars: 2000,
        includeTimeline: false,
        goalId: "goal",
      });
      // Should include goal and its upstream deps
      expect(ctx).toContain("goal");
      expect(ctx).toContain("dep1");
      expect(ctx).toContain("dep2");
    });

    it("collectDepsForGoal finds downstream dependents", () => {
      // Create a graph where something depends on the goal
      const state: EchoState = {
        raw: {
          goal: { id: "goal", type: "planning", summary: "Main goal" },
          dependent: {
            id: "dependent",
            type: "action",
            summary: "Action depending on goal",
            dependsOn: ["goal"],
          },
        },
        summary: {},
        history: [],
        unknowns: [],
        assumptions: [],
      };
      const ctx = buildContext(state, {
        mode: "balanced",
        maxChars: 2000,
        includeTimeline: false,
        goalId: "goal",
      });
      expect(ctx).toContain("goal");
      expect(ctx).toContain("dependent");
    });

    it("collectDepsForGoal includes parent/child relationships", () => {
      const state: EchoState = {
        raw: {
          parent: {
            id: "parent",
            type: "planning",
            summary: "Parent goal",
            children: ["goal"],
          },
          goal: {
            id: "goal",
            type: "planning",
            summary: "Sub-goal",
            parentId: "parent",
          },
          child: {
            id: "child",
            type: "action",
            summary: "Child action",
            parentId: "goal",
          },
        },
        summary: {},
        history: [],
        unknowns: [],
        assumptions: [],
      };
      const ctx = buildContext(state, {
        mode: "balanced",
        maxChars: 2000,
        includeTimeline: false,
        goalId: "goal",
      });
      expect(ctx).toContain("parent");
      expect(ctx).toContain("goal");
      expect(ctx).toContain("child");
    });

    it("100+ node graph produces reasonable context size (~20-30 nodes)", () => {
      const raw: EchoState["raw"] = {
        goal: { id: "goal", type: "planning", summary: "Main goal" },
      };
      // Create 100 facts
      for (let i = 0; i < 100; i++) {
        raw[`fact-${i}`] = { id: `fact-${i}`, type: "fact", summary: `Fact ${i}` };
      }
      // Create 20 assumptions
      for (let i = 0; i < 20; i++) {
        raw[`assump-${i}`] = {
          id: `assump-${i}`,
          type: "assumption",
          summary: `Assumption ${i}`,
        };
      }
      const state: EchoState = {
        raw,
        summary: {},
        history: [],
        unknowns: [],
        assumptions: [],
      };

      const ctx = buildContext(state, {
        mode: "balanced",
        maxChars: 3000, // reasonable budget
        includeTimeline: false,
        goalId: "goal",
      });

      // Count node lines (lines starting with "- ")
      const nodeLines = ctx.split("\n").filter((l) => l.startsWith("- "));
      // With tighter caps, should be roughly 20-40 nodes max
      expect(nodeLines.length).toBeLessThanOrEqual(50);
      expect(nodeLines.length).toBeGreaterThan(5); // at least some content
    });

    it("goal-relevant nodes are prioritized over unrelated nodes", () => {
      const state = makeGraphWithDeps();
      // Add many unrelated nodes to push relevant ones down if scoring didn't work
      for (let i = 0; i < 20; i++) {
        state.raw[`noise-${i}`] = {
          id: `noise-${i}`,
          type: "fact",
          summary: `Noise fact ${i}`,
          updatedAt: "2025-01-01T00:00:00.000Z", // older than deps
        };
      }
      // Make deps more recent
      (state.raw.dep1 as any).updatedAt = "2025-01-02T00:00:00.000Z";
      (state.raw.dep2 as any).updatedAt = "2025-01-02T00:00:00.000Z";

      const ctx = buildContext(state, {
        mode: "balanced",
        maxChars: 1000,
        includeTimeline: false,
        goalId: "goal",
      });

      // Deps should appear before noise due to goal relevance scoring
      expect(ctx).toContain("dep1");
      expect(ctx).toContain("dep2");
    });

    it("overflow indicators still work with tighter caps", () => {
      const raw: EchoState["raw"] = {
        goal: { id: "goal", type: "planning", summary: "Main goal" },
      };
      for (let i = 0; i < 50; i++) {
        raw[`fact-${i}`] = { id: `fact-${i}`, type: "fact", summary: `Fact ${i}` };
      }
      const state: EchoState = {
        raw,
        summary: {},
        history: [],
        unknowns: [],
        assumptions: [],
      };

      const ctx = buildContext(state, {
        mode: "balanced",
        maxChars: 500,
        includeTimeline: false,
      });

      // Should have overflow indicator
      expect(ctx).toMatch(/\.\.\. \(\d+ more/);
    });

    it("archived nodes are excluded from context", () => {
      const state: EchoState = {
        raw: {
          active: { id: "active", type: "fact", summary: "Active fact" },
          archived: {
            id: "archived",
            type: "fact",
            summary: "Archived fact",
            status: "archived",
          },
        },
        summary: {},
        history: [],
        unknowns: [],
        assumptions: [],
      };

      const ctx = buildContext(state, { mode: "balanced", maxChars: 2000 });
      expect(ctx).toContain("Active fact");
      expect(ctx).not.toContain("Archived fact");
    });
  });
});
