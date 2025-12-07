import { StateGraph } from "@langchain/langgraph";
import type { ReasonState } from "../engine/ReasonState.js";
import { canExecute } from "../engine/reconciliation.js";

type Input = { intent: string; type?: "planning" | "action" };

// Minimal compiled graph that delegates execution gating to ReasonState.
export function createDemoAgent(engine: ReasonState) {
  const graph = new StateGraph<Input, Input>({
    channels: ["intent", "type"]
  });

  graph.addNode("gate", async (state) => {
    const allowed = canExecute(state.type ?? "action", engine.snapshot);
    if (!allowed) {
      return { intent: "blocked", type: "action" };
    }
    return state;
  });

  graph.addEdge("__start__", "gate");
  graph.addEdge("gate", "__end__");

  return graph.compile();
}

