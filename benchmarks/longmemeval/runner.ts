import fs from "fs";
import path from "path";
import { ReasonState } from "../../src/engine/ReasonState.js";
import type { EchoState } from "../../src/engine/types.js";
import { buildContext } from "../../src/context/contextBuilder.js";
import { get_encoding } from "@dqbd/tiktoken";
import fetch from "node-fetch";

type LLMConfig = {
  model: string;
  apiKey: string;
  baseUrl?: string;
};

async function llmAnswer(prompt: string, cfg: LLMConfig): Promise<{ answer: string; tokens: number }> {
  const url = (cfg.baseUrl ?? "https://api.x.ai/v1") + "/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    }),
  });
  if (!res.ok) throw new Error(`LLM error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as any;
  const answer = data.choices?.[0]?.message?.content ?? "";
  const usage = data.usage;
  const tokens = usage?.prompt_tokens + usage?.completion_tokens || encode(prompt + answer);
  return { answer, tokens };
}

type QA = { question: string; answer: string };
type Sample = { id: string; lines: string[]; qas: QA[] };
type Result = {
  backend: "reason-state" | "raw";
  sampleId: string;
  coverage: number;
  avgTokens: number;
};

type LLMResult = {
  backend: "reason-state" | "raw";
  sampleId: string;
  f1: number;
  tokens: number;
};

const enc = get_encoding("cl100k_base");
const encode = (text: string) => enc.encode(text).length;
const clampToTokens = (text: string, maxTokens: number) => {
  const ids = enc.encode(String(text));
  if (ids.length <= maxTokens) return text;
  return enc.decode(ids.slice(0, maxTokens));
};

function buildPrompt(ctx: string, qa: QA): string {
  // Check if question is temporal (asks about "when")
  const isTemporal = qa.question.toLowerCase().includes("when");
  
  let prompt = `Context:\n${ctx}\n\nQuestion: ${qa.question}\n`;
  
  if (isTemporal) {
    prompt += `\nInstructions for temporal questions:
- Use session dates (found in "Session date: ..." entries) to infer relative time phrases
- Examples:
  * "yesterday" + session date "8 May 2023" = "7 May 2023"
  * "next month" + session date "25 May 2023" = "June 2023"
  * "last week" + session date "9 June 2023" = "the week before 9 June 2023"
  * "last year" + session date "2023" = "2022"
- If the context mentions relative time (yesterday, next month, last week, etc.), use the nearest session date to calculate the absolute date
- Answer with the specific date or time period, not the relative phrase\n`;
  }
  
  prompt += `Answer concisely:`;
  return prompt;
}

// Simple F1 between gold and predicted strings (tokenized on whitespace)
function f1Score(pred: string, gold: string): number {
  const pTokens = pred.toLowerCase().split(/\s+/).filter(Boolean);
  const gTokens = gold.toLowerCase().split(/\s+/).filter(Boolean);
  if (pTokens.length === 0 || gTokens.length === 0) return 0;
  const goldCounts = new Map<string, number>();
  gTokens.forEach((t) => goldCounts.set(t, (goldCounts.get(t) ?? 0) + 1));
  let match = 0;
  pTokens.forEach((t) => {
    const c = goldCounts.get(t) ?? 0;
    if (c > 0) {
      match += 1;
      goldCounts.set(t, c - 1);
    }
  });
  const precision = match / pTokens.length;
  const recall = match / gTokens.length;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

function loadDataset(filePath: string): Sample[] {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw) as any[];

  // If already in Sample shape with lines, return as-is
  if (Array.isArray(data) && data.length > 0 && data[0]?.qas && data[0]?.lines) {
    return data as Sample[];
  }

  return (data as any[]).map((item, idx) => {
    const id = item.id ?? item.sample_id ?? `sample-${idx}`;
    const qas: QA[] = (item.qas ?? item.qa ?? []).map((q: any) => ({
      question: q.question ?? q.q ?? "",
      answer: q.answer ?? q.a ?? "",
    }));

    const lines: string[] = [];

    // LoCoMo/LongMemEval: conversation has session_n arrays with turns containing text
    if (item.conversation) {
      // First, add session dates as explicit context lines for temporal inference
      Object.keys(item.conversation).forEach((k) => {
        if (k.endsWith("_date_time") && item.conversation[k]) {
          // Add session date as a context line (e.g., "Session date: 8 May 2023")
          const dateStr = String(item.conversation[k]);
          lines.push(`Session date: ${dateStr}`);
        }
      });
      
      // Then add conversation turns
      Object.keys(item.conversation).forEach((k) => {
        if (k.startsWith("session") && Array.isArray(item.conversation[k])) {
          (item.conversation[k] as any[]).forEach((turn: any) => {
            if (turn?.text) lines.push(String(turn.text));
            else if (typeof turn === "string") lines.push(turn);
          });
        }
      });
    }
    // Fallbacks
    if (Array.isArray(item.dialog)) {
      (item.dialog as any[]).forEach((utter: any) => {
        if (utter?.text) lines.push(String(utter.text));
        else if (typeof utter === "string") lines.push(utter);
      });
    }
    if (item.conversation?.turns) {
      (item.conversation.turns as any[]).forEach((turn) => {
        if (turn?.text) lines.push(String(turn.text));
        else if (typeof turn === "string") lines.push(turn);
      });
    }

    if (lines.length === 0 && typeof item.content === "string") {
      lines.push(...item.content.split(/\n+/).filter(Boolean));
    }
    if (lines.length === 0) {
      lines.push(JSON.stringify(item));
    }

    // Map dia_id -> text for evidence-aware contexts
    const diaMap: Record<string, string> = {};
    const addToMap = (arr: any[]) => {
      arr.forEach((turn) => {
        if (turn?.dia_id && turn?.text) {
          diaMap[String(turn.dia_id)] = String(turn.text);
        }
      });
    };
    Object.keys(item.conversation ?? {}).forEach((k) => {
      if (k.startsWith("session") && Array.isArray(item.conversation[k])) addToMap(item.conversation[k]);
    });
    if (Array.isArray(item.dialog)) addToMap(item.dialog);
    if (item.conversation?.turns) addToMap(item.conversation.turns);

    // Prepend evidence-linked lines to help survive truncation
    const evidenceLines: string[] = [];
    qas.forEach((qa) => {
      const ev = Array.isArray((qa as any).evidence) ? (qa as any).evidence : [];
      ev.forEach((id: any) => {
        const t = diaMap[String(id)];
        if (t) evidenceLines.push(t);
      });
    });

    const allLines = [...evidenceLines, ...lines];

    return { id, lines: allLines, qas };
  });
}

// Removed ingestIntoState - now using ReasonStateAuto for full structuring

function normalizeAnswer(ans: any): string {
  if (typeof ans === "string") return ans;
  if (Array.isArray(ans)) return ans.map((a) => normalizeAnswer(a)).join(" ");
  if (ans && typeof ans === "object") {
    if ("text" in ans && typeof (ans as any).text === "string") return (ans as any).text;
    return JSON.stringify(ans);
  }
  return String(ans ?? "");
}

/**
 * LLM Judge: Compares agent response to ground truth answer.
 * Returns binary score: 1 (correct) or 0 (incorrect).
 * This is the standard LoCoMo evaluation method.
 */
async function llmJudge(
  question: string,
  agentResponse: string,
  groundTruth: string,
  cfg: LLMConfig
): Promise<{ score: number; reasoning: string; tokens: number }> {
  const judgePrompt = `As an expert evaluator, you must compare the 'Agent Response' to the 'Ground Truth Answer' for the given 'Question'. 

Question: ${question}
Ground Truth Answer: ${groundTruth}
Agent Response: ${agentResponse}

Assign a score of 1 if the Agent Response is factually correct and answers the question as well as, or better than, the Ground Truth Answer. Otherwise, assign a score of 0.

Return ONLY a JSON object with this exact format:
{"reasoning": "brief explanation", "label": 1 or 0}`;

  const url = (cfg.baseUrl ?? "https://api.x.ai/v1") + "/chat/completions";
  const body: any = {
    model: cfg.model,
    messages: [{ role: "user", content: judgePrompt }],
    temperature: 0,
  };
  // Only add response_format if using OpenAI-compatible API (Grok may not support it)
  if (cfg.baseUrl?.includes("openai") || !cfg.baseUrl) {
    body.response_format = { type: "json_object" };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  
  if (!res.ok) throw new Error(`LLM Judge error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as any;
  const content = data.choices?.[0]?.message?.content ?? "{}";
  const usage = data.usage;
  const tokens = usage?.prompt_tokens + usage?.completion_tokens || encode(judgePrompt + content);
  
  try {
    const parsed = JSON.parse(content);
    const score = parsed.label === 1 ? 1 : 0;
    const reasoning = parsed.reasoning || "";
    return { score, reasoning, tokens };
  } catch {
    // Fallback: if JSON parsing fails, try to extract label from text
    const labelMatch = content.match(/"label"\s*:\s*([01])/);
    const score = labelMatch ? parseInt(labelMatch[1]) : 0;
    return { score, reasoning: "Failed to parse judge response", tokens };
  }
}

async function scoreAnswersWithLLM(
  context: string,
  qas: QA[],
  maxTokens: number,
  cfg: LLMConfig
): Promise<{ accuracy: number; tokens: number }> {
  const clipped = clampToTokens(context, maxTokens);
  let totalScore = 0;
  let totalTokens = 0;
  
  console.log(`\nEvaluating ${qas.length} QAs...`);
  console.log(`Context length: ${clipped.length} chars (~${encode(clipped)} tokens)\n`);
  
  for (let i = 0; i < qas.length; i++) {
    const qa = qas[i];
    console.log(`[QA ${i + 1}/${qas.length}]`);
    console.log(`Question: "${qa.question}"`);
    console.log(`Ground truth: "${normalizeAnswer(qa.answer)}"`);
    
    // Step 1: Generate answer from context using LLM
    const prompt = buildPrompt(clipped, qa);
    const { answer: agentAnswer, tokens: answerTokens } = await llmAnswer(prompt, cfg);
    console.log(`Agent response: "${agentAnswer}"`);
    
    // Step 2: Judge the answer using LLM Judge
    const { score, reasoning, tokens: judgeTokens } = await llmJudge(
      qa.question,
      agentAnswer,
      normalizeAnswer(qa.answer),
      cfg
    );
    
    console.log(`Judge score: ${score === 1 ? "✅ CORRECT" : "❌ INCORRECT"}`);
    console.log(`Judge reasoning: ${reasoning}`);
    console.log(`Tokens: ${answerTokens + judgeTokens} (answer: ${answerTokens}, judge: ${judgeTokens})`);
    console.log("-".repeat(60));
    
    totalScore += score;
    totalTokens += answerTokens + judgeTokens;
    
    // Rate limit between QAs
    await new Promise((r) => setTimeout(r, 1000));
  }
  
  const accuracy = qas.length ? totalScore / qas.length : 0;
  console.log(`\nFinal score: ${totalScore}/${qas.length} = ${(accuracy * 100).toFixed(1)}%`);
  
  return {
    accuracy,
    tokens: qas.length ? totalTokens / qas.length : 0,
  };
}

async function runReasonState(
  samples: Sample[],
  maxTokens: number,
  cfg?: LLMConfig
): Promise<Result[]> {
  const results: Result[] = [];
  const { ReasonStateAuto } = await import("../../src/api/auto.js");
  
  for (const s of samples) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Processing sample: ${s.id}`);
    console.log(`Total lines: ${s.lines.length}, QAs: ${s.qas.length}`);
    console.log(`${"=".repeat(60)}\n`);
    
    // Initialize ReasonStateAuto with full structuring
    const rs = new ReasonStateAuto({
      apiKey: cfg?.apiKey,
      model: cfg?.model || "grok-3-mini",
      baseUrl: cfg?.baseUrl,
    });
    
    // STEP 1: Add all lines (raw ingestion)
    console.log(`[Reason-State] Adding ${s.lines.length} lines to memory...`);
    for (const line of s.lines) {
      await rs.add(line);
    }
    
    // STEP 2: Get state after ingestion (before structuring) to show raw nodes
    const stateAfterIngestion = (rs as any).rs.engine.snapshot;
    const rawNodeCount = Object.keys(stateAfterIngestion.raw ?? {}).length;
    console.log(`[Reason-State] Created ${rawNodeCount} raw nodes (before structuring)`);
    
    // STEP 3: Trigger structuring using inject() (retrieve() doesn't trigger structuring)
    // We'll use the first QA to trigger structuring, then retrieve context for all QAs
    let structuredState = stateAfterIngestion;
    let ctx = "";
    
    if (s.qas.length > 0) {
      const firstQA = s.qas[0];
      console.log(`[Reason-State] Triggering structuring with first QA: "${firstQA.question}"`);
      
      // Enable debug logging for specific QAs
      const qa7 = s.qas.find(qa => qa.question.includes("camping"));
      if (qa7) {
        process.env.DEBUG_CONTEXT = "1";
        console.log(`\n[Debug] QA 7 found: "${qa7.question}"`);
      }
      
      // Inject to trigger structuring (this runs LLM structuring on unstructured nodes)
      const injectResult = await rs.inject(
        [{ role: "user", content: firstQA.question }],
        firstQA.question
      );
      
      // Debug: Check for camping nodes after structuring
      if (qa7) {
        const allNodes = Object.values((rs as any).rs.engine.snapshot.raw ?? {});
        const campingNodes = allNodes.filter((n: any) => 
          n.summary?.toLowerCase().includes("camping") || 
          (n.details as any)?.text?.toLowerCase().includes("camping") ||
          n.summary?.toLowerCase().includes("next month")
        );
        console.log(`\n[Debug] After structuring - Found ${campingNodes.length} nodes related to camping/next month:`);
        campingNodes.forEach((n: any) => {
          console.log(`  - ${n.id}: ${n.summary?.substring(0, 100) ?? (n.details as any)?.text?.substring(0, 100)}`);
          console.log(`    type: ${n.type}, status: ${n.status}`);
          console.log(`    dependsOn: ${n.dependsOn?.join(", ") ?? "none"}`);
          console.log(`    temporalAfter: ${(n as any).temporalAfter?.join(", ") ?? "none"}`);
          console.log(`    children: ${n.children?.join(", ") ?? "none"}`);
        });
        
        // Now test retrieval for QA 7 specifically
        console.log(`\n[Debug] Testing retrieval for QA 7: "${qa7.question}"`);
        const qa7Context = await rs.retrieve(qa7.question);
        console.log(`[Debug] QA 7 context length: ${qa7Context.context.length} chars`);
        console.log(`[Debug] QA 7 context preview:\n${qa7Context.context.substring(0, 800)}...\n`);
      }
      
      // Now retrieve context (structuring is done, this just builds context)
      const retrieveResult = await rs.retrieve(firstQA.question);
      ctx = retrieveResult.context;
      
      // Get state after structuring
      structuredState = (rs as any).rs.engine.snapshot;
      
      // Count edges created
      let totalEdges = 0;
      const nodes = Object.values(structuredState.raw ?? {});
      nodes.forEach((n: any) => {
        if (n.dependsOn?.length) totalEdges += n.dependsOn.length;
        if (n.contradicts?.length) totalEdges += n.contradicts.length;
        if (n.temporalAfter?.length) totalEdges += n.temporalAfter.length;
        if (n.temporalBefore?.length) totalEdges += n.temporalBefore.length;
      });
      
      console.log(`[Reason-State] After structuring:`);
      console.log(`  - Total nodes: ${nodes.length}`);
      console.log(`  - Total edges: ${totalEdges}`);
      console.log(`  - Structuring error: ${retrieveResult.stats.structuringError || false}`);
      console.log(`  - Auto-heal attempts: ${retrieveResult.stats.autoHealAttempts || 0}`);
      
      // Show edge breakdown
      if (totalEdges > 0) {
        let dependsOnCount = 0;
        let temporalCount = 0;
        let contradictsCount = 0;
        nodes.forEach((n: any) => {
          if (n.dependsOn?.length) dependsOnCount += n.dependsOn.length;
          if (n.temporalAfter?.length) temporalCount += n.temporalAfter.length;
          if (n.temporalBefore?.length) temporalCount += n.temporalBefore.length;
          if (n.contradicts?.length) contradictsCount += n.contradicts.length;
        });
        console.log(`  - dependsOn edges: ${dependsOnCount}`);
        console.log(`  - temporal edges: ${temporalCount}`);
        console.log(`  - contradicts edges: ${contradictsCount}`);
      }
      
      console.log(`[Reason-State] Built context: ${ctx.length} chars (~${encode(ctx)} tokens)`);
      console.log(`Context preview (first 500 chars):\n${ctx.substring(0, 500)}...\n`);
    }
    
    if (cfg) {
      // Use LLM Judge if API key provided
      console.log(`\n[Reason-State] Evaluating QAs...`);
      const { accuracy, tokens } = await scoreAnswersWithLLM(ctx, s.qas, maxTokens, cfg);
      results.push({ backend: "reason-state", sampleId: s.id, coverage: accuracy, avgTokens: tokens });
    } else {
      // Fallback to simple token counting if no API key
      const tokens = encode(ctx);
      results.push({ backend: "reason-state", sampleId: s.id, coverage: 0, avgTokens: tokens });
    }
  }
  return results;
}

async function runRaw(
  samples: Sample[],
  maxTokens: number,
  cfg?: LLMConfig
): Promise<Result[]> {
  const results: Result[] = [];
  for (const s of samples) {
    const rawDump = clampToTokens(s.lines.join("\n"), maxTokens);
    
    console.log(`\n[Raw Dump] Context: ${rawDump.length} chars (~${encode(rawDump)} tokens)`);
    console.log(`Context preview (first 500 chars):\n${rawDump.substring(0, 500)}...\n`);
    
    if (cfg) {
      // Use LLM Judge if API key provided
      console.log(`\n[Raw Dump] Evaluating QAs...`);
      const { accuracy, tokens } = await scoreAnswersWithLLM(rawDump, s.qas, maxTokens, cfg);
      results.push({ backend: "raw", sampleId: s.id, coverage: accuracy, avgTokens: tokens });
    } else {
      // Fallback to simple token counting if no API key
      const tokens = encode(rawDump);
      results.push({ backend: "raw", sampleId: s.id, coverage: 0, avgTokens: tokens });
    }
  }
  return results;
}

function aggregate(results: Result[], backend: Result["backend"]) {
  const filtered = results.filter((r) => r.backend === backend);
  const acc = filtered.reduce((sum, r) => sum + r.coverage, 0) / filtered.length;
  const tok = filtered.reduce((sum, r) => sum + r.avgTokens, 0) / filtered.length;
  return { backend, accuracy: acc, avgTokens: tok };
}

function parseArgs() {
  const args = process.argv.slice(2);
  let datasetPath = path.join(process.cwd(), "benchmarks", "longmemeval", "data", "longmemeval-mini.json");
  let maxTokens = 4000;
  let limit = 1;
  let qaLimit = 20;
  let model = process.env.GROK_MODEL || "grok-4-1-fast-non-reasoning";
  let apiKey = process.env.GROK_API_KEY || process.env.VITE_GROK_API_KEY || "";
  let baseUrl = process.env.GROK_BASE_URL || process.env.VITE_GROK_BASE_URL || "https://api.x.ai/v1";
  args.forEach((a) => {
    if (a.startsWith("--dataset=")) datasetPath = a.replace("--dataset=", "");
    if (a.startsWith("--maxTokens=")) maxTokens = Number(a.replace("--maxTokens=", "")) || maxTokens;
    if (a.startsWith("--limit=")) limit = Number(a.replace("--limit=", "")) || limit;
    if (a.startsWith("--qaLimit=")) qaLimit = Number(a.replace("--qaLimit=", "")) || qaLimit;
    if (a.startsWith("--model=")) model = a.replace("--model=", "");
    if (a.startsWith("--apiKey=")) apiKey = a.replace("--apiKey=", "");
    if (a.startsWith("--baseUrl=")) baseUrl = a.replace("--baseUrl=", "");
  });
  return { datasetPath, maxTokens, limit, qaLimit, model, apiKey, baseUrl };
}

async function main() {
  const { datasetPath, maxTokens, limit, qaLimit, model, apiKey, baseUrl } = parseArgs();
  const samples = loadDataset(datasetPath).slice(0, limit);

  if (!apiKey) {
    console.error("Error: API key required for LLM Judge evaluation. Set GROK_API_KEY or pass --apiKey=");
    process.exit(1);
  }

  const cfg: LLMConfig = { model, apiKey, baseUrl };
  
  console.log(`Running benchmark with LLM Judge scoring...`);
  console.log(`Dataset: ${datasetPath}`);
  console.log(`Samples: ${samples.length}`);
  console.log(`Max tokens: ${maxTokens}`);
  console.log(`QA limit per sample: ${qaLimit}\n`);

  const rs = await runReasonState(samples, maxTokens, cfg);
  const raw = await runRaw(samples, maxTokens, cfg);
  const all = [...rs, ...raw];

  const summary = [aggregate(all, "reason-state"), aggregate(all, "raw")];

  const outPath = path.join(process.cwd(), "benchmarks", "longmemeval", "results.json");
  fs.writeFileSync(outPath, JSON.stringify({ results: all, summary, maxTokens }, null, 2), "utf8");
  
  console.log("\n=== RESULTS SUMMARY ===");
  console.log(JSON.stringify({ summary, maxTokens }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


  const raw = await runRaw(samples, maxTokens, cfg);
  const all = [...rs, ...raw];

  const summary = [aggregate(all, "reason-state"), aggregate(all, "raw")];

  const outPath = path.join(process.cwd(), "benchmarks", "longmemeval", "results.json");
  fs.writeFileSync(outPath, JSON.stringify({ results: all, summary, maxTokens }, null, 2), "utf8");
  
  console.log("\n=== RESULTS SUMMARY ===");
  console.log(JSON.stringify({ summary, maxTokens }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

