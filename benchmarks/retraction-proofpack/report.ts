import type { ScenarioRun, QueryResult } from "./score.js";
import { stableHash } from "./runners.js";

export type ProofpackReport = {
  createdAt: string;
  runs: ScenarioRun[];
  hash: string;
};

function pct(n: number): string {
  return `${Math.round(n)}%`;
}

function mean(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function summarize(runs: ScenarioRun[], runnerName: string): { avgTokens: number; passRate: number } {
  const runnerRuns = runs.filter((r) => r.runner === runnerName);
  const queries: QueryResult[] = runnerRuns.flatMap((r) => r.queries);
  const avgTokens = mean(queries.map((q) => q.estTokens));
  const passed = queries.filter((q) => q.passContains && q.passExcludes).length;
  const passRate = queries.length ? passed / queries.length : 0;
  return { avgTokens, passRate };
}

export function buildMarkdown(report: ProofpackReport): string {
  const { avgTokens: promptAvg, passRate: promptPass } = summarize(report.runs, "prompt_append");
  const { avgTokens: kvAvg, passRate: kvPass } = summarize(report.runs, "kv_latest");
  const { avgTokens: rsAvg, passRate: rsPass } = summarize(report.runs, "reason_state");

  const header = [
    "## Retraction/Update proof pack",
    "",
    "What this shows:",
    "- **Drift control**: when facts change, old facts should not remain in context",
    "- **Bounded context**: context size should not grow without bound",
    "- **Determinism**: same inputs produce the same outputs",
    "",
    `Generated: ${report.createdAt}`,
    `Determinism hash: \`${report.hash}\``,
    "",
    "### Summary",
    "| Runner | Avg est tokens (per query) | Proxy correctness pass rate |",
    "|---|---:|---:|",
    `| prompt_append | ${promptAvg.toFixed(0)} | ${pct(promptPass * 100)} |`,
    `| kv_latest | ${kvAvg.toFixed(0)} | ${pct(kvPass * 100)} |`,
    `| reason_state | ${rsAvg.toFixed(0)} | ${pct(rsPass * 100)} |`,
    "",
    "### Notes",
    "- Proxy correctness means: context contains the latest truth and excludes retracted facts (string-based assertions).",
    "- Token estimate is a chars/4 proxy to keep this keyless and reproducible.",
    "",
  ].join("\n");

  // Per-scenario details: only show failures to keep it short.
  const failures: string[] = [];
  for (const run of report.runs) {
    for (const q of run.queries) {
      if (q.passContains && q.passExcludes) continue;
      failures.push(
        [
          `- **${run.scenarioId}** (${run.runner}) — goal: ${q.goal}`,
          q.missing.length ? `  - missing: ${q.missing.join(", ")}` : "",
          q.presentButShouldNot.length ? `  - should-not-have: ${q.presentButShouldNot.join(", ")}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      );
    }
  }

  const tail = [
    "### Failures (if any)",
    failures.length ? failures.join("\n") : "- None",
    "",
  ].join("\n");

  return `${header}\n${tail}`;
}

export function buildReport(runs: ScenarioRun[]): ProofpackReport {
  const base = {
    createdAt: new Date().toISOString(),
    runs,
    hash: "",
  };
  const hash = stableHash({ runs });
  return { ...base, hash };
}


