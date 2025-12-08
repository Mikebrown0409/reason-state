import { runXAgent } from "../examples/agents/xAgent.js";
import fs from "fs";
import path from "path";

function loadDotEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^VITE_(X_BEARER_TOKEN|GROK_API_KEY)=(.+)$/);
    if (m) {
      process.env[m[1]] = m[2].trim();
    }
  }
}

function requireEnv(key: string): string {
  const val =
    process.env[key] ||
    process.env[`VITE_${key}`] ||
    (key === "X_BEARER_TOKEN" ? process.env.GROK_API_KEY : undefined) ||
    (key === "GROK_API_KEY" ? process.env.X_BEARER_TOKEN : undefined);
  if (!val) throw new Error(`Missing required env: ${key} (no fallback)`);
  return val;
}

async function main() {
  loadDotEnv();
  requireEnv("X_BEARER_TOKEN");
  requireEnv("GROK_API_KEY");

  const query = "Tokyo travel";
  const budget = 4000;

  const res = await runXAgent(query, budget);

  console.log("agent events", res.events);
  console.log("planPatches", res.planPatches);
  console.log("xCount", res.xCount);
  console.log("history length", res.history.length);

  console.assert(res.history.length > 0, "history should not be empty");
  console.assert(res.events.length > 0, "events should not be empty");
  console.assert(
    Array.isArray(res.planPatches) || res.planPatches === undefined,
    "planPatches should be array or undefined when model fails"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
