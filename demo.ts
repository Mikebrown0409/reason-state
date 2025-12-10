import "dotenv/config";
import ReasonState from "./src/index.js";

async function main() {
  const grokKey = process.env.GROK_API_KEY ?? process.env.VITE_GROK_API_KEY;
  const apiKey =
    process.env.OPENAI_API_KEY ??
    process.env.VITE_OPENAI_API_KEY ??
    grokKey;

  const hasGrok = !!grokKey && !process.env.OPENAI_API_KEY && !process.env.VITE_OPENAI_API_KEY;

  const baseUrl =
    process.env.BASE_URL ??
    process.env.OPENAI_BASE_URL ??
    process.env.VITE_OPENAI_BASE_URL ??
    process.env.GROK_BASE_URL ??
    process.env.VITE_GROK_BASE_URL ??
    (hasGrok ? "https://api.x.ai/v1" : undefined);

  const model =
    process.env.MODEL ??
    process.env.OPENAI_MODEL ??
    (hasGrok ? "grok-4-1-fast-non-reasoning" : "gpt-4o-mini");

  console.log("reason-state demo");
  console.log(apiKey ? "Planner: enabled (API key found)" : "Planner: skipped (no API key)");

  const rs = new ReasonState({
    apiKey,
    baseUrl,
    model,
    maxTokens: 800,
  });

  await rs.add("User hates meetings on Friday", { id: "friday" });
  await rs.add("Team retro is weekly on Mondays at 10am PT", { id: "retro" });
  await rs.add("Budget review is Thursday 3pm PT", { id: "budget" });
  await rs.add("Alice PTO next Tuesday", { id: "pto", type: "assumption" });

  // Add a simple edge: retro scheduling depends on knowing PTO.
  await rs.update("retro", { summary: "Team retro is weekly on Mondays at 10am PT", reason: "depends on PTO" });
  rs.state.raw["retro"].dependsOn = ["pto"];

  console.log("\n--- Retrieve (no LLM) ---");
  const retrieve = await rs.query("When should we schedule the retro?", { mode: "retrieve" });
  const lines = (retrieve.context ?? "").split("\n").filter(Boolean);
  const totalNodes = Object.keys(rs.state.raw ?? {}).length;
  console.log(`context lines: ${lines.length} (nodes in state: ${totalNodes})`);
  console.log(lines.slice(0, 12).join("\n"));
  const edgeNode = Object.values(rs.state.raw).find((n) => n.dependsOn && n.dependsOn.length);
  if (edgeNode) {
    console.log("Edges (sample):", `${edgeNode.id} depends_on ${edgeNode.dependsOn?.join(", ")}`);
  }

  if (!apiKey) {
    console.log("\nPlanner step skipped (set OPENAI_API_KEY / GROK_API_KEY to enable).");
    return;
  }

  console.log("\n--- Plan (LLM) ---");
  try {
    const plan = await rs.query("When should we schedule the retro?");
    console.log("patches:", JSON.stringify(plan.patches ?? [], null, 2));
    console.log("state.summary keys:", Object.keys(plan.state.summary));
  } catch (err) {
    console.error("Planner step failed:", err);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

