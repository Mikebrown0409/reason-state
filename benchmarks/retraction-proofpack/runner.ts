import fs from "fs";
import path from "path";
import { scenarios } from "./scenarios.js";
import {
  createKvLatestRunner,
  createPromptAppendRunner,
  createReasonStateRunner,
} from "./runners.js";
import { runScenario } from "./score.js";
import { buildMarkdown, buildReport } from "./report.js";

async function main() {
  const maxChars = 4000;
  const maxTokens = 1000;

  const runners = [
    createPromptAppendRunner({ maxChars }),
    createKvLatestRunner({ maxChars }),
    createReasonStateRunner({ maxTokens }),
  ];

  const runs = [];
  for (const scenario of scenarios) {
    for (const runner of runners) {
      runs.push(await runScenario(scenario, runner));
    }
  }

  const report = buildReport(runs);
  const md = buildMarkdown(report);

  // Write artifacts (for docs + reproducibility)
  const outDir = path.resolve(process.cwd(), "benchmarks", "retraction-proofpack");
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(path.join(outDir, "report.md"), md, "utf8");

  // Print the markdown summary to stdout
  console.log(md);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


