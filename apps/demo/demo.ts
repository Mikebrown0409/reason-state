import "dotenv/config";
import { ReasonState } from "../../src/index.js";
import { injectMemoryContext, type ChatMessage } from "../../src/integrations/openaiMessages.js";
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

function roiLine(params: {
  rawChars: number;
  rawTokens: number;
  contextChars: number;
  estTokens: number;
  unknown: number;
  dirty: number;
  blocked: number;
}): string {
  const savedPct =
    params.rawTokens > 0 ? Math.round((1 - params.estTokens / params.rawTokens) * 100) : 0;
  return `ROI: context=${params.contextChars} chars (~${params.estTokens} tok) | raw=${params.rawChars} chars (~${params.rawTokens} tok) | saved≈${savedPct}% | unknown=${params.unknown} dirty=${params.dirty} blocked=${params.blocked}`;
}

async function main() {
  const { apiKey, baseUrl, model } = resolveKeys();

  console.log("reason-state demo — keyless retrieve + explicit retract/heal\n");
  console.log(
    apiKey ? "Planner: enabled (API key found)" : "Planner: keyless mode (retrieve-only + canned)"
  );

  const rs = new ReasonState({
    apiKey,
    baseUrl,
    model,
    maxTokens: 400,
  });

  // 1) Seed facts
  await rs.add("User hates meetings on Friday", { key: "pref:no_friday_meetings", type: "fact" });
  await rs.add("Team retro is weekly on Mondays at 10am PT", { key: "schedule:retro", type: "fact" });
  await rs.add("Alice is on PTO next Tuesday", { key: "assumption:pto", type: "assumption" });

  // For comparison: raw dump tokens vs balanced context
  const raw = rawDump(rs);
  const rawTokens = tokenCount(raw);
  const rawChars = raw.length;

  const goal = "When should we schedule the retro?";
  const baseMessages: ChatMessage[] = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: goal },
  ];

  console.log("\n1) Plan (with PTO present)");
  let planAnswer = "(planner skipped — no API key)";
  if (!apiKey) {
    const { messages: withMemory, stats } = await injectMemoryContext(rs, baseMessages, { goal });
    const canned = `Canned suggestion (no API key): aim for Monday 10am PT, avoid Friday conflicts; retract PTO if canceled.`;
    console.log(JSON.stringify(withMemory.slice(0, 1), null, 2));
    console.log(canned);
    console.log(
      roiLine({
        rawChars,
        rawTokens,
        contextChars: stats.contextChars,
        estTokens: stats.estTokens,
        unknown: stats.unknownCount,
        dirty: stats.dirtyCount,
        blocked: stats.blockedCount,
      })
    );
  } else {
    const plan = await rs.plan(goal);
    planAnswer = plan.patches?.length ? JSON.stringify(plan.patches) : plan.context ?? "";
    console.log(planAnswer.slice(0, 200) + "...");
    const touchCount = plan.patches?.length ?? 0;
    console.log(`Touched nodes: ${touchCount} (includes goal summary)`);
    const { stats } = await rs.retrieve(goal);
    console.log(
      roiLine({
        rawChars,
        rawTokens,
        contextChars: stats.contextChars,
        estTokens: stats.estTokens,
        unknown: stats.unknownCount,
        dirty: stats.dirtyCount,
        blocked: stats.blockedCount,
      })
    );
  }

  // 2) Retract PTO and show heal
  await rs.retract("assumption:pto", { heal: true, reason: "PTO canceled" });
  console.log("\n2) Retracted 'Alice PTO' + heal() — same question, no reroll");
  if (!apiKey) {
    const { messages: withMemory2 } = await injectMemoryContext(rs, baseMessages, { goal });
    const canned2 = `Canned follow-up: with PTO retracted, keep Monday 10am PT; note Alice is available.`;
    console.log(JSON.stringify(withMemory2.slice(0, 1), null, 2));
    console.log(canned2);
  } else {
    const plan2 = await rs.plan(goal);
    const healed = plan2.patches?.length ? JSON.stringify(plan2.patches) : plan2.context ?? "";
    console.log(healed.slice(0, 200) + "...");
    const touchCount2 = plan2.patches?.length ?? 0;
    console.log(`Touched nodes: ${touchCount2} (retract heal)`);
  }

  // Token savings vs raw dump (always)
  const { stats } = await rs.retrieve(goal);
  const ctxTokens = stats.estTokens;
  const ratio = ctxTokens === 0 ? "∞" : (rawTokens / ctxTokens).toFixed(1);
  console.log(`\nToken savings vs raw dump: ${rawTokens} → ${ctxTokens} (~${ratio}x)`);
  console.log("Note: retract() marks the assumption dirty; heal() resolves contradictions deterministically.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

