import { describe, expect, it, vi, beforeEach } from "vitest";
import { ReasonStateSimple } from "../src/api/simple.js";

vi.mock("../src/tools/openaiCompatiblePlanner.js", () => {
  return {
    openaiCompatiblePlanWithContext: vi.fn(async () => ({ patches: [] })),
  };
});

describe("ReasonStateSimple production auto-heal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retracts low-confidence contradictions, retries, and avoids rollback", async () => {
    const rs = new ReasonStateSimple({ mode: "production" });

    await rs.add(
      { contradicts: "node-b", confidence: 0.1, summary: "A" },
      { id: "node-a", type: "assumption", summary: "A", confidence: 0.1 }
    );
    await rs.add(
      { contradicts: "node-a", confidence: 0.9, summary: "B" },
      { id: "node-b", type: "assumption", summary: "B", confidence: 0.9 }
    );

    const res = await rs.query("goal");

    expect(res.stats?.autoHealRolledBack).toBe(false);
    expect(res.stats?.autoHealAttempts).toBeGreaterThanOrEqual(1);
    expect(res.state.raw["node-a"]?.assumptionStatus).toBe("retracted");
    expect(res.state.raw["node-b"]?.assumptionStatus).toBe("retracted");
  });
});

