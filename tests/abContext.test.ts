import { describe, it } from "vitest";
import { buildContext } from "../src/context/contextBuilder.js";
import { grokChat } from "../src/tools/grokChat.js";
import type { EchoState } from "../src/engine/types.js";

const hasKey =
  !!process.env.GROK_API_KEY ||
  !!process.env.VITE_GROK_API_KEY ||
  typeof (globalThis as any).__VITE_GROK_API_KEY__ !== "undefined";

type Task = {
  goal: string;
  facts: string[];
  assert: (resp: string) => boolean;
};

const tasks: Task[] = [
  {
    goal: "Refactor payment module",
    facts: ["Use TypeScript", "Add tests"],
    assert: (resp) => resp.toLowerCase().includes("refactor") && resp.toLowerCase().includes("payment"),
  },
  {
    goal: "Add logging to auth service",
    facts: ["Avoid PII", "Use structured logs"],
    assert: (resp) => resp.toLowerCase().includes("log"),
  },
];

describe.skipIf(!hasKey)("A/B: buildContext vs raw dump (live Grok)", () => {
  async function runVariant(task: Task, useContext: boolean): Promise<{ text: string; length: number }> {
    const state: EchoState = {
      raw: {
        goal: { id: "goal", type: "planning", summary: task.goal, status: "open" },
        ...task.facts.reduce<Record<string, any>>((acc, f, i) => {
          acc[`fact-${i}`] = { id: `fact-${i}`, type: "fact", summary: f };
          return acc;
        }, {}),
      },
      summary: {},
      history: [],
      unknowns: [],
      assumptions: [],
    };
    const content = useContext
      ? buildContext(state, { includeTimeline: false, maxChars: 800 })
      : JSON.stringify(state.raw);
    const prompt = `You are assisting a coding task. Given the context:\n${content}\nRespond with next steps under 60 words.`;
    const text = await grokChat(prompt);
    return { text, length: text.length };
  }

  it(
    "logs token/length/quality diffs for raw vs buildContext",
    { timeout: 20000 },
    async () => {
    for (const task of tasks) {
      const [rawResp, ctxResp] = await Promise.all([runVariant(task, false), runVariant(task, true)]);
      const passedRaw = task.assert(rawResp.text);
      const passedCtx = task.assert(ctxResp.text);
      console.log(
        `[A/B] goal="${task.goal}" rawLen=${rawResp.length} ctxLen=${ctxResp.length} passRaw=${passedRaw} passCtx=${passedCtx}`
      );
    }
    }
  );
});

