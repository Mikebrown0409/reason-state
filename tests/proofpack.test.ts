import { describe, it, expect } from "vitest";
import { scenarios } from "../benchmarks/retraction-proofpack/scenarios.js";
import {
  createPromptAppendRunner,
  createReasonStateRunner,
  stableHash,
} from "../benchmarks/retraction-proofpack/runners.js";
import { runScenario } from "../benchmarks/retraction-proofpack/score.js";

describe("retraction proof pack (smoke)", () => {
  it("reason-state passes proxy correctness on travel pivot; prompt-append fails exclude", async () => {
    const scenario = scenarios.find((s) => s.id === "travel_pivot");
    expect(scenario).toBeTruthy();
    if (!scenario) return;

    const prompt = createPromptAppendRunner({ maxChars: 4000 });
    const rs = createReasonStateRunner({ maxTokens: 1000 });

    const promptRun = await runScenario(scenario, prompt);
    const rsRun = await runScenario(scenario, rs);

    // Last query is the post-retraction query.
    const promptLast = promptRun.queries[promptRun.queries.length - 1];
    const rsLast = rsRun.queries[rsRun.queries.length - 1];

    expect(rsLast.passContains).toBe(true);
    expect(rsLast.passExcludes).toBe(true);

    // Prompt append baseline tends to keep old facts in the prompt.
    expect(promptLast.passExcludes).toBe(false);
  });

  it("determinism: same scenario+runner yields identical hash", async () => {
    const scenario = scenarios.find((s) => s.id === "budget_revision");
    expect(scenario).toBeTruthy();
    if (!scenario) return;

    const runnerA = createPromptAppendRunner({ maxChars: 4000 });
    const runnerB = createPromptAppendRunner({ maxChars: 4000 });

    const runA = await runScenario(scenario, runnerA);
    const runB = await runScenario(scenario, runnerB);

    expect(stableHash(runA)).toBe(stableHash(runB));
  });
});


