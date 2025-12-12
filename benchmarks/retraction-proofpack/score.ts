import type { Scenario, ScenarioStep } from "./types.js";
import type { MemoryRunner } from "./types.js";

export type QueryResult = {
  goal: string;
  contextChars: number;
  estTokens: number;
  savedPctVsPromptAppend?: number;
  passContains: boolean;
  passExcludes: boolean;
  missing: string[];
  presentButShouldNot: string[];
};

export type ScenarioRun = {
  scenarioId: string;
  title: string;
  runner: string;
  queries: QueryResult[];
};

function includesAll(haystack: string, needles: string[]): { pass: boolean; missing: string[] } {
  const missing = needles.filter((n) => !haystack.includes(n));
  return { pass: missing.length === 0, missing };
}

function excludesAll(haystack: string, needles: string[]): { pass: boolean; present: string[] } {
  const present = needles.filter((n) => haystack.includes(n));
  return { pass: present.length === 0, present };
}

export async function runScenario(scenario: Scenario, runner: MemoryRunner): Promise<ScenarioRun> {
  const queries: QueryResult[] = [];

  for (const step of scenario.steps) {
    await applyStep(step, runner, queries);
  }

  return { scenarioId: scenario.id, title: scenario.title, runner: runner.name, queries };
}

async function applyStep(step: ScenarioStep, runner: MemoryRunner, queries: QueryResult[]) {
  if (step.op === "add") {
    await runner.add(step.key, step.value);
    return;
  }
  if (step.op === "update") {
    await runner.update(step.key, step.value);
    return;
  }
  if (step.op === "retract") {
    await runner.retract(step.key);
    return;
  }
  if (step.op === "query") {
    const res = await runner.retrieve(step.goal);
    const ctx = res.context ?? "";
    const expectContains = step.expectContains ?? [];
    const expectExcludes = step.expectExcludes ?? [];
    const contains = includesAll(ctx, expectContains);
    const excludes = excludesAll(ctx, expectExcludes);
    queries.push({
      goal: step.goal,
      contextChars: res.stats.contextChars,
      estTokens: res.stats.estTokens,
      passContains: contains.pass,
      passExcludes: excludes.pass,
      missing: contains.missing,
      presentButShouldNot: excludes.present,
    });
  }
}


