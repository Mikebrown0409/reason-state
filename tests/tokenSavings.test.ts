/**
 * Token Savings Benchmark
 * 
 * Measures actual token/character savings when using buildContext vs naive JSON dump.
 * Run with: npx vitest run tests/tokenSavings.bench.ts
 */
import { describe, it, expect } from "vitest";
import { buildContext } from "../src/context/contextBuilder.js";
import type { EchoState, StateNode } from "../src/engine/types.js";

type Scenario = {
  name: string;
  nodeCount: number;
  noiseRatio: number; // 0-1, percentage of nodes that are noise
  description: string;
};

const scenarios: Scenario[] = [
  { name: "small-clean", nodeCount: 20, noiseRatio: 0.2, description: "20 nodes, 20% noise" },
  { name: "medium-noisy", nodeCount: 50, noiseRatio: 0.5, description: "50 nodes, 50% noise" },
  { name: "large-noisy", nodeCount: 100, noiseRatio: 0.6, description: "100 nodes, 60% noise" },
  { name: "xlarge-noisy", nodeCount: 200, noiseRatio: 0.7, description: "200 nodes, 70% noise" },
  { name: "multi-turn-sim", nodeCount: 150, noiseRatio: 0.65, description: "150 nodes, 65% noise (simulates 20-turn conversation)" },
];

function generateState(scenario: Scenario): EchoState {
  const raw: Record<string, StateNode> = {};
  const noiseCount = Math.floor(scenario.nodeCount * scenario.noiseRatio);
  const signalCount = scenario.nodeCount - noiseCount;
  
  // Add goal
  raw["goal"] = {
    id: "goal",
    type: "planning",
    summary: "Plan a complex multi-region service migration with payments and auth refactor",
    status: "open",
  };
  
  // Add signal nodes (actual useful content)
  const signalFacts = [
    "User wants to travel to Tokyo in March",
    "Budget is $5000 for the entire trip",
    "Prefer direct flights over connections",
    "Need hotel near Shibuya station",
    "Traveling with 2 adults",
    "Vegetarian food preferences",
    "Payment module must support multi-region failover",
    "Use TypeScript strict mode for all new code",
    "Add contract tests for checkout API",
    "Auth service needs structured logging with correlation IDs",
    "Avoid PII in logs per compliance requirement",
    "DB migrations must be backward compatible",
    "Feature flags guard all rollouts",
    "Stage rollout by region starting with US-WEST",
    "Keep latency under 150ms p95",
    "Cache TTL 5 minutes for pricing data",
    "Document rollback steps for each phase",
    "User prefers morning meetings (9-11 AM)",
    "Timezone is PST (UTC-8)",
    "Weekly sync on Tuesdays",
  ];
  
  const signalAssumptions = [
    "Circuit breaker pattern for external calls",
    "Consider DB read replicas for scaling",
    "May need idempotency keys for payments",
    "Rate limits may be required for auth",
    "Chaos testing in staging before prod",
  ];
  
  const signalUnknowns = [
    "Exact cutover window TBD",
    "Budget for extra infrastructure",
    "Which regions to prioritize",
    "Oncall ownership during rollout",
  ];
  
  for (let i = 0; i < Math.min(signalCount - 10, signalFacts.length); i++) {
    raw[`fact-${i}`] = {
      id: `fact-${i}`,
      type: "fact",
      summary: signalFacts[i % signalFacts.length],
      updatedAt: new Date(Date.now() - i * 60000).toISOString(),
    };
  }
  
  for (let i = 0; i < Math.min(5, signalAssumptions.length); i++) {
    raw[`assump-${i}`] = {
      id: `assump-${i}`,
      type: "assumption",
      summary: signalAssumptions[i],
      assumptionStatus: "valid",
      status: "open",
    };
  }
  
  for (let i = 0; i < Math.min(4, signalUnknowns.length); i++) {
    raw[`unknown-${i}`] = {
      id: `unknown-${i}`,
      type: "unknown",
      summary: signalUnknowns[i],
      status: "blocked",
    };
  }
  
  // Add noise nodes (irrelevant content)
  for (let i = 0; i < noiseCount; i++) {
    raw[`noise-${i}`] = {
      id: `noise-${i}`,
      type: "fact",
      summary: `Unrelated detail #${i}: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Noise content that should be deprioritized.`,
      updatedAt: new Date(Date.now() - (signalCount + i) * 3600000).toISOString(), // older
    };
  }
  
  return {
    raw,
    summary: {},
    history: [],
    unknowns: Object.keys(raw).filter((k) => k.startsWith("unknown-")),
    assumptions: Object.keys(raw).filter((k) => k.startsWith("assump-")),
  };
}

function naiveJsonDump(state: EchoState): string {
  // Simulates what a dev might do: just JSON.stringify everything
  const dump = {
    memories: Object.values(state.raw).map((n) => ({
      id: n.id,
      type: n.type,
      summary: n.summary,
    })),
  };
  return JSON.stringify(dump);
}

function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English text
  return Math.ceil(text.length / 4);
}

describe("Token Savings Benchmark", () => {
  const results: Array<{
    scenario: string;
    nodeCount: number;
    noiseRatio: string;
    naiveChars: number;
    contextChars: number;
    naiveTokens: number;
    contextTokens: number;
    charSavings: string;
    tokenSavings: string;
  }> = [];

  scenarios.forEach((scenario) => {
    it(`measures savings for ${scenario.name} (${scenario.description})`, () => {
      const state = generateState(scenario);
      const naive = naiveJsonDump(state);
      const context = buildContext(state, {
        mode: "balanced",
        maxChars: 4000,
        includeTimeline: false,
      });

      const naiveChars = naive.length;
      const contextChars = context.length;
      const naiveTokens = estimateTokens(naive);
      const contextTokens = estimateTokens(context);
      
      const charSavings = ((1 - contextChars / naiveChars) * 100).toFixed(1);
      const tokenSavings = ((1 - contextTokens / naiveTokens) * 100).toFixed(1);

      results.push({
        scenario: scenario.name,
        nodeCount: scenario.nodeCount,
        noiseRatio: `${(scenario.noiseRatio * 100).toFixed(0)}%`,
        naiveChars,
        contextChars,
        naiveTokens,
        contextTokens,
        charSavings: `${charSavings}%`,
        tokenSavings: `${tokenSavings}%`,
      });

      console.log(
        `[TokenSavings] ${scenario.name}: naive=${naiveChars} chars (${naiveTokens} tokens), ` +
        `context=${contextChars} chars (${contextTokens} tokens), ` +
        `savings=${charSavings}% chars, ${tokenSavings}% tokens`
      );

      // Context should be smaller than naive dump for noisy scenarios
      if (scenario.noiseRatio >= 0.5) {
        expect(contextChars).toBeLessThan(naiveChars);
      }
    });
  });

  it("prints summary table", () => {
    console.log("\n" + "=".repeat(100));
    console.log("TOKEN SAVINGS BENCHMARK SUMMARY");
    console.log("=".repeat(100));
    console.log(
      "| Scenario       | Nodes | Noise  | Naive Chars | Context Chars | Naive Tokens | Context Tokens | Savings |"
    );
    console.log(
      "|----------------|-------|--------|-------------|---------------|--------------|----------------|---------|"
    );
    
    let totalNaive = 0;
    let totalContext = 0;
    
    results.forEach((r) => {
      console.log(
        `| ${r.scenario.padEnd(14)} | ${String(r.nodeCount).padStart(5)} | ${r.noiseRatio.padStart(6)} | ` +
        `${String(r.naiveChars).padStart(11)} | ${String(r.contextChars).padStart(13)} | ` +
        `${String(r.naiveTokens).padStart(12)} | ${String(r.contextTokens).padStart(14)} | ${r.tokenSavings.padStart(7)} |`
      );
      totalNaive += r.naiveTokens;
      totalContext += r.contextTokens;
    });
    
    const avgSavings = ((1 - totalContext / totalNaive) * 100).toFixed(1);
    console.log("=".repeat(100));
    console.log(`AVERAGE TOKEN SAVINGS: ${avgSavings}%`);
    console.log("=".repeat(100) + "\n");

    // This is the number we'll use in the README
    expect(parseFloat(avgSavings)).toBeGreaterThan(50);
  });
});
