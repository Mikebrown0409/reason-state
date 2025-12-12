/**
 * LangGraph-style integration (thin wrapper).
 *
 * This example is dependency-free (no langgraph import) but shows the exact seam:
 * inject governed memory context into the `messages[]` you already pass around the graph.
 */
import { ReasonState } from "reason-state";
import { injectMemoryContext, type ChatMessage } from "reason-state/integrations/openai";

type GraphState = {
  goal: string;
  messages: ChatMessage[];
};

async function memoryNode(rs: ReasonState, state: GraphState): Promise<GraphState> {
  const { messages: withMemory, stats } = await injectMemoryContext(rs, state.messages, {
    goal: state.goal,
  });
  console.log("memory stats:", stats);
  return { ...state, messages: withMemory };
}

async function main() {
  const rs = new ReasonState({ maxTokens: 800 });
  await rs.add("User prefers short answers", { key: "pref:short_answers" });

  let state: GraphState = {
    goal: "Draft a one-paragraph email update to my team.",
    messages: [{ role: "user", content: "Draft a one-paragraph email update to my team." }],
  };

  // In LangGraph you'd run a node; here we just call it directly.
  state = await memoryNode(rs, state);

  console.log("graph state messages:", JSON.stringify(state.messages, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
