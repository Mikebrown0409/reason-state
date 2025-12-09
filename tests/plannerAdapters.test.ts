import { describe, it, expect, vi, beforeEach } from "vitest";
import { openaiPlanWithContext } from "../src/tools/openaiPlanner.js";
import { anthropicPlanWithContext } from "../src/tools/anthropicPlanner.js";
import type { EchoState } from "../src/engine/types.js";

const state: EchoState = {
  raw: { goal: { id: "goal", type: "planning", summary: "Do thing" } },
  summary: {},
  history: [],
  unknowns: [],
  assumptions: [],
};

function mockEnv(key: string, value: string) {
  (process.env as any)[key] = value;
}

describe("planner adapters (OpenAI/Anthropic)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("openaiPlanWithContext retries invalid output then returns validated patches", async () => {
    mockEnv("OPENAI_API_KEY", "test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch" as any)
      // first call invalid JSON content
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: '{"op":"add","path":"/raw/x"}' } }] }),
          { status: 200 }
        )
      )
      // second call valid patches
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '[{"op":"add","path":"/summary/goal","value":"Goal: Do thing"}]',
                },
              },
            ],
          }),
          { status: 200 }
        )
      );

    const res = await openaiPlanWithContext(state, "Do thing");
    expect(res.attempts).toBe(2);
    expect(res.patches[0].path).toBe("/summary/goal");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("anthropicPlanWithContext retries invalid output then returns validated patches", async () => {
    mockEnv("ANTHROPIC_API_KEY", "test");
    const fetchMock = vi
      .spyOn(globalThis, "fetch" as any)
      // invalid first
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ content: [{ text: '{"op":"add","path":"/raw/x"}' }] }), {
          status: 200,
        })
      )
      // valid second
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [
              {
                text: '[{"op":"add","path":"/summary/goal","value":"Goal: Do thing"}]',
              },
            ],
          }),
          { status: 200 }
        )
      );

    const res = await anthropicPlanWithContext(state, "Do thing");
    expect(res.attempts).toBe(2);
    expect(res.patches[0].path).toBe("/summary/goal");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
