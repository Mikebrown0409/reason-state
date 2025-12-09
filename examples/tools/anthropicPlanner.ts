import type { EchoState, Patch } from "../../src/engine/types.js";
import type { PlannerResult } from "../../src/agent/planAndAct.js";

/**
 * Example planner adapter for Anthropic-compatible chat completions.
 * This stub avoids pulling Anthropic as a dependency; fill in the fetch/client call with your implementation.
 */
export async function anthropicPlanner(state: EchoState, prompt: string): Promise<PlannerResult> {
  const context = JSON.stringify(state.summary ?? {});

  // Replace with your Anthropic client call; ensure it returns validated patches.
  const fakePatches: Patch[] = [
    {
      op: "add",
      path: "/summary/agent-note",
      value: `Anthropic stub: ${prompt.slice(0, 40)}...`,
    },
  ];

  return { patches: fakePatches, attempts: 1, raw: "anthropic planner stub" };
}
