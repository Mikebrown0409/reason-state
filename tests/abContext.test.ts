import { describe, it, expect } from "vitest";
import { buildContext } from "../src/context/contextBuilder.js";
import { grokChat } from "../src/tools/grokChat.js";
import type { EchoState } from "../src/engine/types.js";

const hasKey =
  !!process.env.GROK_API_KEY ||
  !!process.env.VITE_GROK_API_KEY ||
  typeof (globalThis as any).__VITE_GROK_API_KEY__ !== "undefined";

describe.skipIf(!hasKey)("A/B: buildContext vs raw dump (live Grok)", () => {
  const state: EchoState = {
    raw: {
      goal: {
        id: "goal",
        type: "planning",
        summary: "Refactor payment service",
        details: { module: "payments", priority: "high" },
        status: "open",
      },
      fact1: { id: "fact1", type: "fact", summary: "Use TypeScript" },
      fact2: { id: "fact2", type: "fact", summary: "Add tests" },
      unknown1: { id: "u1", type: "unknown", summary: "Database choice pending" },
    },
    summary: {},
    history: [],
    unknowns: ["u1"],
    assumptions: [],
  };

  async function runPrompt(content: string): Promise<string> {
    const prompt = `You are assisting a coding task. Given the context:\n${content}\nRespond with next steps under 50 words.`;
    return grokChat(prompt);
  }

  it("prefers buildContext over raw dump for brevity and relevance", async () => {
    const rawDump = JSON.stringify(state.raw);
    const ctx = buildContext(state, { includeTimeline: false, maxChars: 800 });

    const [rawResp, ctxResp] = await Promise.all([runPrompt(rawDump), runPrompt(ctx)]);

    // Heuristic: context response should be concise and mention the goal;
    // should not look like a raw JSON echo.
    expect(ctxResp.toLowerCase()).toContain("refactor");
    expect(ctxResp.toLowerCase()).toContain("payment");
    expect(ctxResp).not.toContain("{");
    expect(ctxResp.length).toBeLessThan(400);
  });
});

