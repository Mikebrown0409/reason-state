import { StateGraph } from "@langchain/langgraph";
import type { ReasonState } from "../engine/ReasonState.js";
import { canExecute } from "../engine/reconciliation.js";
import { xSearch } from "../tools/xSearch.js";
import { grokChat, grokPlanPatch } from "../tools/grokChat.js";
import { mockBooking } from "../tools/mockBooking.js";

type AgentState = {
  query: string;
  plan?: string;
  booking?: string;
};

// LangGraph demo agent: research X -> plan with Grok -> mock book.
export function createDemoAgent(engine: ReasonState) {
  const graph = new StateGraph<AgentState>({
    channels: ["query", "plan", "booking"]
  });

  graph.addNode("gate", async (state) => {
    const allowed = canExecute("action", engine.snapshot);
    if (!allowed) {
      return { ...state, plan: "blocked" };
    }
    return state;
  });

  graph.addNode("researchX", async (state) => {
    const patches = await xSearch(state.query);
    if (patches.length > 0) engine.applyPatches(patches);
    return state;
  });

  graph.addNode("planWithGrok", async (state) => {
    const content = await grokChat(`Create a concise travel plan for: ${state.query}`);
    engine.applyPatches([grokPlanPatch(content)]);
    return { ...state, plan: content };
  });

  graph.addNode("bookTravel", async (state) => {
    const patches = await mockBooking({ id: "demo", destination: state.query, budget: 4000 });
    engine.applyPatches(patches);
    return { ...state, booking: "submitted" };
  });

  graph.addEdge("__start__", "gate");
  graph.addEdge("gate", "researchX");
  graph.addEdge("researchX", "planWithGrok");
  graph.addEdge("planWithGrok", "bookTravel");
  graph.addEdge("bookTravel", "__end__");

  return graph.compile();
}

