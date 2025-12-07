import { describe, it, expect } from "vitest";
import { grokPlanWithContext } from "../src/tools/grokChat.js";
import { createEmptyState } from "../src/engine/types.js";

describe("live grok diagnostic (small context)", () => {
  it(
    "logs outbound context and inbound raw/patches for debugging",
    { timeout: 30000 },
    async () => {
      const key =
        process.env.GROK_API_KEY ||
        process.env.VITE_GROK_API_KEY ||
        (globalThis as any).__VITE_GROK_API_KEY__;
      if (!key) {
        console.warn("Skipping: GROK_API_KEY missing");
        return;
      }

      const state = createEmptyState();
      state.raw["goal"] = {
        id: "goal",
        type: "planning",
        summary: "Plan for Tokyo",
        details: { destination: "Tokyo", budget: 4000 }
      };
      state.summary["goal"] = "Goal: Tokyo";

      const res = await grokPlanWithContext(state, "Create a concise, valid patch for the goal");

      console.log("grok outbound goal:", "Create a concise, valid patch for the goal");
      console.log("grok outbound summary keys:", Object.keys(state.summary));
      console.log("grok raw response:", res.raw);
      console.log("grok attempts:", res.attempts, "lastError:", res.lastError);
      console.log("grok patches:", res.patches);

      expect(res.raw).toBeDefined();
      expect(res.patches).toBeDefined();
    }
  );
});


