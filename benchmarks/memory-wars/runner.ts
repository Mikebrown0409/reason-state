import fs from "fs";
import path from "path";
import { ReasonState } from "../../src/engine/ReasonState.js";
import type { EchoState, Patch } from "../../src/engine/types.js";
import { buildContext } from "../../src/context/contextBuilder.js";
import { openaiCompatiblePlanWithContext } from "../../src/tools/openaiCompatiblePlanner.js";
import tiktoken from "@dqbd/tiktoken";
import mem0 from "@mem0ai/mem0ai";

type Backend = "reason-state" | "raw" | "mem0" | "letta";

type ScenarioResult = {
  backend: Backend;
  scenario: string;
  tokens: number;
  coverage: number;
  heal?: boolean;
};

type Scenario = {
  name: string;
  build: () => { state: EchoState; question: string; answer: string; budget?: number };
};

function tokenizer(): (text: string) => number {
  const enc = tiktoken.get_encoding("cl100k_base");
  return (text: string) => enc.encode(text).length;
}

function coverage(text: string, answer: string): number {
  const lower = text.toLowerCase();
  return lower.includes(answer.toLowerCase()) ? 1 : 0;
}

async function runReasonState(
  scenario: Scenario,
  encode: (text: string) => number,
  goal: string
): Promise<ScenarioResult> {
  const { state, question, answer } = scenario.build();
  const ctx = buildContext(state);
  const res = await openaiCompatiblePlanWithContext(state, goal, {
    apiKey: process.env.OPENAI_API_KEY ?? "test-key",
    fetcher: async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify([{ op: "add", path: "/summary/answer", value: answer }]) } }],
        }),
        { status: 200 }
      ),
  });
  const tokens = encode(ctx);
  const cov = coverage(ctx, answer);
  return { backend: "reason-state", scenario: scenario.name, tokens, coverage: cov, heal: true };
}

function runRaw(scenario: Scenario, encode: (text: string) => number): ScenarioResult {
  const { state, answer, budget } = scenario.build();
  const raw = JSON.stringify(state.raw);
  const truncated = budget ? raw.slice(0, budget) : raw;
  return { backend: "raw", scenario: scenario.name, tokens: encode(truncated), coverage: coverage(truncated, answer) };
}

async function runMem0(
  scenario: Scenario,
  encode: (text: string) => number
): Promise<ScenarioResult> {
  const client = mem0();
  const { state, answer } = scenario.build();
  Object.values(state.raw).forEach((n) => {
    client.add(n.summary ?? JSON.stringify(n));
  });
  const ctx = await client.search(answer, { limit: 50 });
  const text = JSON.stringify(ctx);
  return { backend: "mem0", scenario: scenario.name, tokens: encode(text), coverage: coverage(text, answer) };
}

async function runLetta(
  scenario: Scenario,
  encode: (text: string) => number
): Promise<ScenarioResult> {
  const { state, answer } = scenario.build();
  const text = JSON.stringify(state.raw).slice(0, 5000);
  return { backend: "letta", scenario: scenario.name, tokens: encode(text), coverage: coverage(text, answer) };
}

function scenarioMultiHop(): Scenario {
  return {
    name: "multi-hop",
    build: () => {
      const raw: Record<string, any> = {};
      for (let i = 0; i < 120; i++) {
        raw[`fact-${i}`] = { id: `fact-${i}`, type: "fact", summary: `Fact number ${i}` };
      }
      const state: EchoState = { raw, summary: {}, history: [], unknowns: [], assumptions: [] };
      return { state, question: "What is fact 73?", answer: "Fact number 73", budget: 2000 };
    },
  };
}

function scenarioRetraction(): Scenario {
  return {
    name: "assumption-retraction",
    build: () => {
      const raw: Record<string, any> = {};
      for (let i = 0; i < 50; i++) {
        raw[`fact-${i}`] = { id: `fact-${i}`, type: "fact", summary: `Fact ${i}` };
      }
      raw["assump-1"] = {
        id: "assump-1",
        type: "assumption",
        summary: "Destination is Tokyo",
        assumptionStatus: "valid",
        status: "open",
      };
      raw["assump-1"].assumptionStatus = "retracted";
      raw["assump-1"].summary = "Destination is not Tokyo";
      const state: EchoState = { raw, summary: {}, history: [], unknowns: [], assumptions: [] };
      return { state, question: "Where is the destination?", answer: "not Tokyo", budget: 2000 };
    },
  };
}

function scenarioStarvation(): Scenario {
  return {
    name: "token-starvation",
    build: () => {
      const raw: Record<string, any> = {};
      for (let i = 0; i < 400; i++) {
        raw[`fact-${i}`] = { id: `fact-${i}`, type: "fact", summary: `Noise detail ${i}` };
      }
      raw["target"] = { id: "target", type: "fact", summary: "Critical fact: keep me" };
      const state: EchoState = { raw, summary: {}, history: [], unknowns: [], assumptions: [] };
      return { state, question: "What is the critical fact?", answer: "Critical fact: keep me", budget: 2000 };
    },
  };
}

function scenarioRealTrace(): Scenario {
  return {
    name: "real-trace",
    build: () => {
      const raw: Record<string, any> = {};
      for (let i = 0; i < 80; i++) {
        raw[`turn-${i}`] = { id: `turn-${i}`, type: "fact", summary: `User said line ${i}` };
      }
      raw["turn-42"].summary = "User said they are traveling to Madrid next week";
      const state: EchoState = { raw, summary: {}, history: [], unknowns: [], assumptions: [] };
      return { state, question: "Where are they traveling?", answer: "Madrid", budget: 2000 };
    },
  };
}

async function main() {
  const encode = tokenizer();
  const scenarios = [scenarioMultiHop(), scenarioRetraction(), scenarioStarvation(), scenarioRealTrace()];
  const results: ScenarioResult[] = [];

  for (const scenario of scenarios) {
    results.push(await runReasonState(scenario, encode, scenario.question));
    results.push(runRaw(scenario, encode));
    results.push(await runMem0(scenario, encode));
    results.push(await runLetta(scenario, encode));
  }

  const out = JSON.stringify(results, null, 2);
  const outPath = path.join(process.cwd(), "benchmarks", "memory-wars", "results.json");
  fs.writeFileSync(outPath, out, "utf8");
  console.log(out);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

