import { ReasonState } from "reason-state";
import { injectMemoryContext, type ChatMessage } from "reason-state/integrations/openai";

async function main() {
  const rs = new ReasonState({ maxTokens: 800 });

  // Write memory (stable keys optional but recommended for retract/update)
  await rs.add("User hates meetings on Friday", { key: "pref:no_friday_meetings" });
  await rs.add("Team retro is weekly on Mondays at 10am PT", { key: "schedule:retro" });
  await rs.add("Alice is on PTO next Tuesday", { key: "assumption:pto", type: "assumption" });

  const goal = "When should we schedule the retro?";

  const messages: ChatMessage[] = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: goal },
  ];

  // Keyless-safe: does not call any LLM, only builds governed context + stats.
  const { messages: withMemory, stats } = await injectMemoryContext(rs, messages, { goal });

  console.log("Injected messages:");
  console.log(JSON.stringify(withMemory, null, 2));
  console.log("ROI stats:", stats);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


