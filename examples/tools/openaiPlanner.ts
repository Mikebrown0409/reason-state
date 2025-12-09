import type { EchoState, Patch } from "../../src/engine/types.js";
import type { PlannerResult } from "../../src/agent/planAndAct.js";

/**
 * Example planner adapter for OpenAI-compatible chat completions.
 * This stub avoids pulling OpenAI as a dependency; fill in the fetch call with your client.
 */
export async function openaiPlanner(state: EchoState, prompt: string): Promise<PlannerResult> {
  // Build a summaries-only context if desired (optional)
  const context = JSON.stringify(state.summary ?? {});

  // Replace this with your OpenAI client call; ensure it returns validated patches.
  const fakePatches: Patch[] = [
    {
      op: "add",
      path: "/summary/agent-note",
      value: `OpenAI stub: ${prompt.slice(0, 40)}...`,
    },
  ];

  return { patches: fakePatches, attempts: 1, raw: "openai planner stub" };
}

