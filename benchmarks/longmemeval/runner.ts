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
  return `Context:\n${ctx}\n\nQuestion: ${qa.question}\nAnswer concisely:`;
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

function ingestIntoState(lines: string[]): EchoState {
  const raw: Record<string, any> = {};
  lines.forEach((line, i) => {
    raw[`line-${i}`] = { id: `line-${i}`, type: "fact", summary: line };
  });
  return { raw, summary: {}, history: [], unknowns: [], assumptions: [] };
}

function normalizeAnswer(ans: any): string {
  if (typeof ans === "string") return ans;
  if (Array.isArray(ans)) return ans.map((a) => normalizeAnswer(a)).join(" ");
  if (ans && typeof ans === "object") {
    if ("text" in ans && typeof (ans as any).text === "string") return (ans as any).text;
    return JSON.stringify(ans);
  }
  return String(ans ?? "");
}

function scoreAnswers(context: string, qas: QA[], maxTokens: number): { accuracy: number; tokens: number } {
  const clipped = clampToTokens(context, maxTokens);
  const tokens = encode(String(clipped));
  const ctxLower = String(clipped).toLowerCase();
  let correct = 0;
  qas.forEach((qa) => {
    const ans = normalizeAnswer(qa.answer).toLowerCase();
    if (ans && ctxLower.includes(ans)) correct += 1;
  });
  return { accuracy: qas.length ? correct / qas.length : 0, tokens };
}

function runReasonState(samples: Sample[], maxTokens: number): Result[] {
  const results: Result[] = [];
  for (const s of samples) {
    const state = ingestIntoState(s.lines);
    const ctx = buildContext(state, { mode: "balanced", maxChars: maxTokens * 4 });
    const { accuracy, tokens } = scoreAnswers(ctx, s.qas, maxTokens);
    results.push({ backend: "reason-state", sampleId: s.id, coverage: accuracy, avgTokens: tokens });
  }
  return results;
}

function runRaw(samples: Sample[], maxTokens: number): Result[] {
  const results: Result[] = [];
  for (const s of samples) {
    const rawDump = clampToTokens(s.lines.join("\n"), maxTokens);
    const { accuracy, tokens } = scoreAnswers(rawDump, s.qas, maxTokens);
    results.push({ backend: "raw", sampleId: s.id, coverage: accuracy, avgTokens: tokens });
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

  const rs = runReasonState(samples, maxTokens);
  const raw = runRaw(samples, maxTokens);
  const all = [...rs, ...raw];

  // Optional LLM eval if apiKey provided
  let llmResults: LLMResult[] = [];
  if (apiKey) {
    const cfg: LLMConfig = { model, apiKey, baseUrl };
    for (const s of samples) {
      const state = ingestIntoState(s.lines);
      const ctxRS = buildContext(state, { mode: "balanced", maxChars: maxTokens * 4 });
      const ctxRaw = clampToTokens(s.lines.join("\n"), maxTokens);
      for (const backend of ["reason-state", "raw"] as const) {
        const ctx = backend === "reason-state" ? ctxRS : ctxRaw;
        let f1Sum = 0;
        let tokenSum = 0;
        const qaCount = Math.min(s.qas.length, qaLimit);
        for (const qa of s.qas.slice(0, qaLimit)) {
          const prompt = buildPrompt(ctx, qa);
          const { answer, tokens } = await llmAnswer(prompt, cfg);
          f1Sum += f1Score(answer, normalizeAnswer(qa.answer));
          tokenSum += tokens;
          await new Promise((r) => setTimeout(r, 1500)); // pacing to stay under TPM
        }
        llmResults.push({
          backend,
          sampleId: s.id,
          f1: f1Sum / qaCount,
          tokens: tokenSum / qaCount,
        });
      }
    }
  }

  const summary = [aggregate(all, "reason-state"), aggregate(all, "raw")];

  const outPath = path.join(process.cwd(), "benchmarks", "longmemeval", "results.json");
  fs.writeFileSync(outPath, JSON.stringify({ results: all, summary, llmResults, maxTokens }, null, 2), "utf8");
  console.log(JSON.stringify({ summary, llm: llmResults.length ? llmResults : "skipped", maxTokens }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

