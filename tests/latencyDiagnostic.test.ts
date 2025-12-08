import { describe, it, expect } from "vitest";
import { runSimpleAgent } from "../examples/agents/simpleAgent.js";

describe("latency diagnostic (simple agent end-to-end)", () => {
  it("measures Grok+booking wall time", { timeout: 60000 }, async () => {
    const start = Date.now();
    const res = await runSimpleAgent("Tokyo", 4000);
    const end = Date.now();
    const wallMs = end - start;

    console.log("latency diagnostic:", {
      wallMs,
      historyLen: res.history.length,
      events: res.events,
    });

    expect(res.history.length).toBeGreaterThan(0);
    // Assert that total wall time is within a sane bound (e.g., < 15s)
    expect(wallMs).toBeLessThan(15000);
  });
});
