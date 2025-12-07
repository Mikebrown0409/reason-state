import { describe, it, expect, vi } from "vitest";
import { runSimpleAgent } from "../examples/agents/simpleAgent.js";
import type { GrokPlanResult } from "../src/tools/grokChat.js";

let capturedCall: { goal?: string; rawIds?: string[]; summaries?: Record<string, string> } = {};

vi.mock("../src/tools/grokChat.js", async (orig) => {
  const mod = await orig();
  return {
    ...mod,
    grokPlanWithContext: vi.fn(async (state: any, goal: string): Promise<GrokPlanResult> => {
      capturedCall = {
        goal,
        rawIds: Object.keys(state.raw ?? {}),
        summaries: { ...(state.summary ?? {}) }
      };
      return {
        patches: [
          { op: "replace", path: "/summary/goal", value: "Goal: mock plan" },
          { op: "add", path: "/summary/budget", value: "Budget: mock" }
        ],
        attempts: 1,
        raw: JSON.stringify([{ op: "replace", path: "/summary/goal", value: "Goal: mock plan" }])
      };
    })
  };
});

describe("demo exposure: what we send/receive with Grok", () => {
  it("captures outbound goal/context and inbound patches/meta", async () => {
    const res = await runSimpleAgent("Tokyo", 4000);

    // What we send: goal string and state context (ids, summaries) captured by mock grokPlanWithContext
    expect(capturedCall.goal).toContain("Tokyo");
    expect(capturedCall.rawIds).toContain("goal");
    expect(capturedCall.summaries?.goal).toBeDefined(); // pre-seeded summary

    // What we receive: patches applied into state and plan meta history retained
    const lastState = res.history[res.history.length - 1].state;
    expect(lastState.summary.goal).toBe("Goal: mock plan");

    expect(res.planPatches?.length).toBeGreaterThan(0);
    expect(res.planMetaHistory && res.planMetaHistory.length).toBeGreaterThan(0);
    expect(res.planMetaHistory?.[0].raw).toBeDefined();
  });
});


