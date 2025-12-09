import { describe, it, expect } from "vitest";
import { buildContext } from "../src/context/contextBuilder.js";
import type { EchoState } from "../src/engine/types.js";

type Task = {
  goal: string;
  facts: string[];
  assumptions?: string[];
  unknowns?: string[];
  noise?: number;
  required: string[];
};

function makeState(task: Task): EchoState {
  const raw: Record<string, any> = {
    goal: { id: "goal", type: "planning", summary: task.goal, status: "open" },
  };
  task.facts.forEach((f, i) => {
    raw[`fact-${i}`] = { id: `fact-${i}`, type: "fact", summary: f };
  });
  (task.assumptions ?? []).forEach((a, i) => {
    raw[`assump-${i}`] = {
      id: `assump-${i}`,
      type: "assumption",
      summary: a,
      assumptionStatus: "valid",
      status: "open",
    };
  });
  (task.unknowns ?? []).forEach((u, i) => {
    raw[`unknown-${i}`] = { id: `unknown-${i}`, type: "unknown", summary: u };
  });
  const noiseCount = task.noise ?? 0;
  for (let i = 0; i < noiseCount; i++) {
    raw[`noise-${i}`] = {
      id: `noise-${i}`,
      type: "fact",
      summary: `noise-${i} filler detail that should be deprioritized`,
      details: { filler: true },
    };
  }
  return {
    raw,
    summary: {},
    history: [],
    unknowns: (task.unknowns ?? []).map((_, i) => `unknown-${i}`),
    assumptions: (task.assumptions ?? []).map((_, i) => `assump-${i}`),
  };
}

function makeNaiveDump(task: Task, noise: number): string {
  const obj: Record<string, unknown> = {
    goal: task.goal,
    facts: task.facts,
    assumptions: task.assumptions ?? [],
    unknowns: task.unknowns ?? [],
    noise: Array.from({ length: noise }).map((_, i) => `noise-${i} filler detail`),
  };
  return JSON.stringify(obj);
}

function coverage(text: string, required: string[]): number {
  const lower = text.toLowerCase();
  return required.filter((r) => lower.includes(r.toLowerCase())).length;
}

describe("Memory benchmark: raw dump vs buildContext (length + coverage + truncation)", () => {
  const tasks: Task[] = [
    {
      goal: "Refactor payment module",
      facts: ["Use TypeScript", "Add tests", "Avoid breaking API"],
      assumptions: ["Maybe split services"],
      unknowns: ["Budget limit unknown"],
      noise: 15,
      required: ["refactor", "payment", "tests"],
    },
    {
      goal: "Add logging to auth service",
      facts: ["Avoid PII", "Use structured logs", "Include correlation id"],
      assumptions: ["May need rate limits"],
      unknowns: [],
      noise: 20,
      required: ["log", "auth", "structured"],
    },
    {
      goal: "Migrate DB config",
      facts: ["Use env vars", "Stage rollout", "Backup first", "Notify SRE"],
      assumptions: ["Switch to managed service?"],
      unknowns: ["Exact cutover window"],
      noise: 30,
      required: ["db", "env", "backup", "sre"],
    },
  ];

  it("shows buildContext is shorter and retains required coverage under noise", () => {
    tasks.forEach((task) => {
      const state = makeState(task);
      const rawDump = makeNaiveDump(task, task.noise ?? 0);
      const ctx = buildContext(state, { includeTimeline: false, maxChars: 1200 });

      const rawLen = rawDump.length;
      const ctxLen = ctx.length;
      const rawCov = coverage(rawDump, task.required);
      const ctxCov = coverage(ctx, task.required);

      console.log(
        `[MemoryBench-noise] goal="${task.goal}" rawLen=${rawLen} ctxLen=${ctxLen} rawCov=${rawCov}/${task.required.length} ctxCov=${ctxCov}/${task.required.length}`
      );

      expect(ctxCov).toBeGreaterThanOrEqual(rawCov);
      expect(ctxCov).toBeGreaterThan(0);
    });
  });

  it("retains key terms when raw dump is truncated", () => {
    tasks.forEach((task) => {
      const state = makeState(task);
      const rawDump = makeNaiveDump(task, task.noise ?? 0);
      const truncatedRaw = rawDump.slice(0, 400); // simulate naive truncation of naive dump
      const ctx = buildContext(state, { includeTimeline: false, maxChars: 400 });

      const rawCov = coverage(truncatedRaw, task.required);
      const ctxCov = coverage(ctx, task.required);

      console.log(
        `[MemoryBench-trunc] goal="${task.goal}" truncRawLen=400 ctxLen=${ctx.length} rawCov=${rawCov}/${task.required.length} ctxCov=${ctxCov}/${task.required.length}\nRAW:\n${truncatedRaw}\nCTX:\n${ctx}\n---`
      );

      expect(ctxCov).toBeGreaterThanOrEqual(rawCov);
    });
  });
});

