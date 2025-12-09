import { describe, it, expect } from "vitest";
import { buildContext } from "../src/context/contextBuilder.js";
import type { EchoState } from "../src/engine/types.js";

type Task = {
  goal: string;
  facts: string[];
  unknowns?: string[];
  required: string[];
};

const tasks: Task[] = [
  {
    goal: "Refactor payment module",
    facts: ["Use TypeScript", "Add tests", "Avoid breaking API"],
    required: ["refactor", "payment", "tests"],
  },
  {
    goal: "Add logging to auth service",
    facts: ["Avoid PII", "Use structured logs", "Include correlation id"],
    required: ["log", "auth"],
  },
  {
    goal: "Migrate DB config",
    facts: ["Use env vars", "Stage rollout", "Backup first"],
    required: ["db", "env", "backup"],
  },
];

function makeState(task: Task): EchoState {
  const raw: Record<string, any> = {
    goal: { id: "goal", type: "planning", summary: task.goal, status: "open" },
  };
  task.facts.forEach((f, i) => {
    raw[`fact-${i}`] = { id: `fact-${i}`, type: "fact", summary: f };
  });
  (task.unknowns ?? []).forEach((u, i) => {
    raw[`unknown-${i}`] = { id: `unknown-${i}`, type: "unknown", summary: u };
  });
  return {
    raw,
    summary: {},
    history: [],
    unknowns: (task.unknowns ?? []).map((_, i) => `unknown-${i}`),
    assumptions: [],
  };
}

describe("Memory benchmark: raw dump vs buildContext (length + content)", () => {
  it("compares lengths and coverage of required terms", () => {
    tasks.forEach((task) => {
      const state = makeState(task);
      const rawDump = JSON.stringify(state.raw);
      const ctx = buildContext(state, { includeTimeline: false, maxChars: 1200 });

      const rawLen = rawDump.length;
      const ctxLen = ctx.length;

      const rawCoverage = task.required.filter((r) => rawDump.toLowerCase().includes(r)).length;
      const ctxCoverage = task.required.filter((r) => ctx.toLowerCase().includes(r)).length;

      // Log for inspection; keep assertions loose to avoid flakiness.
      console.log(
        `[MemoryBench] goal="${task.goal}" rawLen=${rawLen} ctxLen=${ctxLen} rawCov=${rawCoverage}/${task.required.length} ctxCov=${ctxCoverage}/${task.required.length}`
      );

      // Expect context to be shorter than raw dump in most cases.
      expect(ctxLen).toBeLessThanOrEqual(rawLen);
      // Expect coverage to be at least as good as raw (summaries should keep key terms).
      expect(ctxCoverage).toBeGreaterThanOrEqual(rawCoverage);
    });
  });
});

