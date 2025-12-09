import type { Patch } from "../../src/engine/types.js";
import type { PlannerResult } from "../../src/agent/planAndAct.js";

/**
 * Example planner stub for non-Grok providers.
 * Replace the body with your LLM/tool call that returns validated patches.
 */
export async function plannerStub(): Promise<PlannerResult> {
  const patches: Patch[] = [
    {
      op: "add",
      path: "/summary/agent-note",
      value: "Agent note: stub planner ran",
    },
  ];
  return { patches, attempts: 1, raw: "stub planner" };
}
