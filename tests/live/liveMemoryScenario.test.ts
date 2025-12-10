import { describe, it, expect } from "vitest";
import { buildContext } from "../../src/context/contextBuilder.js";
import { grokChat } from "../../src/tools/grokChat.js";
import type { EchoState } from "../../src/engine/types.js";

const hasKey =
  !!process.env.GROK_API_KEY ||
  !!process.env.VITE_GROK_API_KEY ||
  typeof (globalThis as any).__VITE_GROK_API_KEY__ !== "undefined";

type Scenario = {
  goal: string;
  facts: string[];
  assumptions: string[];
  unknowns: string[];
  noise: number;
  requiredTerms: string[];
};

const scenario: Scenario = {
  goal: "Refactor and harden payments and auth services across multi-region",
  facts: [
    "Payments module must support multi-region failover",
    "Use TypeScript strict mode",
    "Add contract tests for checkout API",
    "Auth service needs structured logging with correlation IDs",
    "Avoid PII in logs",
    "Add retry/backoff on payment provider calls",
    "DB migrations must be backward compatible",
    "Feature flags guard rollout",
    "Stage rollout by region",
    "Add alerts for error rate spike",
    "Cache TTL 5 minutes for pricing",
    "Use env vars for secrets",
    "Document rollback steps",
    "Keep latency under 150ms p95",
    "Run load test before GA",
  ],
  assumptions: [
    "Maybe split payments write path later",
    "Consider circuit breaker for provider",
    "Might need idempotency keys",
    "Auth rate limits may be required",
    "Evaluate managed secrets store",
    "Chaos test in staging first",
    "Consider DB read replicas",
    "Audit logging scope TBD",
    "Fallback to cached pricing on provider failure",
    "Legacy clients must remain supported",
  ],
  unknowns: [
    "Exact cutover window",
    "Budget for extra infra",
    "Which regions first",
    "Who owns oncall for rollout",
    "Payment provider SLA details",
  ],
  noise: 50,
  requiredTerms: ["payments", "auth", "logging", "tests", "rollout", "latency", "pii"],
};

function makeState(s: Scenario): EchoState {
  const raw: Record<string, any> = {
    goal: { id: "goal", type: "planning", summary: s.goal, status: "open" },
  };
  s.facts.forEach((f, i) => {
    raw[`fact-${i}`] = { id: `fact-${i}`, type: "fact", summary: f };
  });
  s.assumptions.forEach((a, i) => {
    raw[`assump-${i}`] = {
      id: `assump-${i}`,
      type: "assumption",
      summary: a,
      assumptionStatus: "valid",
      status: "open",
    };
  });
  s.unknowns.forEach((u, i) => {
    raw[`unknown-${i}`] = { id: `unknown-${i}`, type: "unknown", summary: u };
  });
  for (let i = 0; i < s.noise; i++) {
    raw[`noise-${i}`] = {
      id: `noise-${i}`,
      type: "fact",
      summary: `noise-${i} filler detail about unrelated module`,
    };
  }
  return {
    raw,
    summary: {},
    history: [],
    unknowns: s.unknowns.map((_, i) => `unknown-${i}`),
    assumptions: s.assumptions.map((_, i) => `assump-${i}`),
  };
}

function makeNaiveDump(s: Scenario): string {
  return JSON.stringify({
    goal: s.goal,
    facts: s.facts,
    assumptions: s.assumptions,
    unknowns: s.unknowns,
    notes: Array.from({ length: s.noise }).map((_, i) => `noise-${i} filler detail`),
  });
}

function coverage(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.filter((t) => lower.includes(t.toLowerCase())).length;
}

describe.skipIf(!hasKey)("Live memory scenario: raw dump vs buildContext (Grok)", () => {
  it("compares raw vs context on a large state", { timeout: 30000 }, async () => {
    const state = makeState(scenario);
    const rawDump = makeNaiveDump(scenario);
    const ctx = buildContext(state, { includeTimeline: false, maxChars: 4000 });

    const prompt = (content: string) =>
      `You are assisting with a large refactor. Context:\n${content}\nRespond with 3-5 next steps under 120 words. Mention payments, auth, logging, and rollout where relevant.`;

    const [rawResp, ctxResp] = await Promise.all([
      grokChat(prompt(rawDump)),
      grokChat(prompt(ctx)),
    ]);

    const rawCov = coverage(rawResp, scenario.requiredTerms);
    const ctxCov = coverage(ctxResp, scenario.requiredTerms);

    console.log(
      `[LiveMemory] rawLen=${rawDump.length} ctxLen=${ctx.length} rawRespLen=${rawResp.length} ctxRespLen=${ctxResp.length} rawCov=${rawCov}/${scenario.requiredTerms.length} ctxCov=${ctxCov}/${scenario.requiredTerms.length}`
    );
    console.log(`[LiveMemory RAW RESP]\n${rawResp}\n---\n[LiveMemory CTX RESP]\n${ctxResp}\n---`);

    // Sanity: both responses should at least mention the goal domain.
    expect(rawResp.length).toBeGreaterThan(0);
    expect(ctxResp.length).toBeGreaterThan(0);
  });
});
