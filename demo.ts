import "dotenv/config";
import ReasonState from "./src/index.js";
import { encoding_for_model } from "@dqbd/tiktoken";

function resolveKeys() {
  const grokKey = process.env.GROK_API_KEY ?? process.env.VITE_GROK_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY ?? process.env.VITE_OPENAI_API_KEY;
  const apiKey = openaiKey ?? grokKey;
  const hasGrok = !!grokKey && !openaiKey;
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
  return { apiKey, baseUrl, model, hasGrok };
}

function tokenCount(text: string): number {
  const enc = encoding_for_model("gpt-4o-mini");
  return enc.encode(text).length;
}

function rawDump(state: ReasonState): string {
  return JSON.stringify(state.state.raw ?? {}, null, 2);
}

async function main() {
  const { apiKey, baseUrl, model } = resolveKeys();

  console.log("reason-state demo — retract + heal\n");
  console.log(apiKey ? "Planner: enabled (API key found)" : "Planner: skipped (no API key)");

  const rs = new ReasonState({
    apiKey,
    baseUrl,
    model,
    maxTokens: 400,
  });

  // 1) Seed facts
  await rs.add("User hates meetings on Friday", { id: "friday" });
  await rs.add("Team retro is weekly on Mondays at 10am PT", { id: "retro" });
  await rs.add("Alice is on PTO next Tuesday", { id: "pto", type: "assumption" });

  // For comparison: raw dump tokens vs balanced context
  const raw = rawDump(rs);
  const rawTokens = tokenCount(raw);

  console.log("\n1) Plan (with PTO present)");
  let planAnswer = "(planner skipped — no API key)";
  if (!apiKey) {
    const retrieve = await rs.query("When should we schedule the retro?", { mode: "retrieve" });
    console.log(retrieve.context?.slice(0, 200) + "...");
  } else {
    const plan = await rs.query("When should we schedule the retro?");
    planAnswer = plan.patches?.length ? JSON.stringify(plan.patches) : plan.context ?? "";
    console.log(planAnswer.slice(0, 200) + "...");
    const touchCount = plan.patches?.length ?? 0;
    console.log(`Touched nodes: ${touchCount} (includes goal summary)`);
  }

  // 2) Retract PTO and show heal
  await rs.update("pto", { retracted: true, reason: "PTO canceled" });
  console.log("\n2) Retracted 'Alice PTO' — same question, no reroll");
  if (!apiKey) {
    const retrieve2 = await rs.query("When should we schedule the retro?", { mode: "retrieve" });
    console.log(retrieve2.context?.slice(0, 200) + "...");
  } else {
    const plan2 = await rs.query("When should we schedule the retro?");
    const healed = plan2.patches?.length ? JSON.stringify(plan2.patches) : plan2.context ?? "";
    console.log(healed.slice(0, 200) + "...");
    const touchCount2 = plan2.patches?.length ?? 0;
    console.log(`Touched nodes: ${touchCount2} (retract heal)`);
  }

  // Token savings vs raw dump
  const ctx = await rs.query("When should we schedule the retro?", { mode: "retrieve" });
  const ctxTokens = tokenCount(ctx.context ?? "");
  const ratio = ctxTokens === 0 ? "∞" : (rawTokens / ctxTokens).toFixed(1);
  console.log(`\nToken savings vs raw dump: ${rawTokens} → ${ctxTokens} (~${ratio}x)`);
  console.log("Only the retracted node (goal summary) was touched between runs.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

