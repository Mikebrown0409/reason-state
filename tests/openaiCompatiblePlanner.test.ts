import { describe, it, expect, vi, beforeEach } from "vitest";
import { openaiCompatiblePlanWithContext } from "../src/tools/openaiCompatiblePlanner.js";
import type { EchoState } from "../src/engine/types.js";

const state: EchoState = {
  raw: { goal: { id: "goal", type: "planning", summary: "Do thing" } },
  summary: {},
  history: [],
  unknowns: [],
  assumptions: [],
};

describe("openaiCompatiblePlanWithContext", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (process.env as any).OPENAI_API_KEY = "test";
  });

  it("retries on invalid output and returns validated patches", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch" as any)
      // invalid first
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: '{"op":"add","path":"/raw/x"}' } }] }),
          { status: 200 }
        )
      )
      // valid second
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

    const res = await openaiCompatiblePlanWithContext(state, "Do thing", { model: "any" });
    expect(res.attempts).toBe(2);
    expect(res.patches[0].path).toBe("/summary/goal");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
