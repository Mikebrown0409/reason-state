import { describe, it, expect } from "vitest";
import { buildContext } from "../src/context/contextBuilder.js";
import type { EchoState } from "../src/engine/types.js";
import type { VectorStore } from "../src/context/vectorStore.js";

const makeState = (): EchoState => ({
  raw: {
    goal: { id: "goal", type: "planning", summary: "Plan a company offsite" },
    beach: { id: "beach", type: "fact", summary: "Beach resort has good weather" },
    mountain: { id: "mountain", type: "fact", summary: "Mountain lodge has hiking trails" },
    city: { id: "city", type: "fact", summary: "City hotel has conference rooms" },
  },
  summary: {},
  assumptions: [],
  unknowns: [],
  history: [],
});

function makeStore(): VectorStore {
  return {
    query: () => [
      { id: "city", score: 0.9 },
      { id: "beach", score: 0.5 },
    ],
  };
}

describe("buildContext with vectorStore", () => {
  it("surfaces vector hits ahead of other facts", () => {
    const state = makeState();
    const ctx = buildContext(state, {
      mode: "balanced",
      maxChars: 500,
      vectorStore: makeStore(),
      vectorTopK: 2,
      queryText: "rooms and weather",
    });
    expect(ctx.indexOf("city")).toBeGreaterThan(-1);
    expect(ctx.indexOf("beach")).toBeGreaterThan(-1);
    expect(ctx.indexOf("city")).toBeLessThan(ctx.indexOf("mountain"));
  });

  it("falls back to default when no vectorStore", () => {
    const state = makeState();
    const ctx = buildContext(state, { mode: "balanced", maxChars: 500 });
    expect(ctx).toContain("goal");
  });
});
