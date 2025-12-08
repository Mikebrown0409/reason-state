import fs from "fs";
import path from "path";
import { runDagAgent } from "../examples/agents/dagAgent.js";

function loadDotEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^VITE_(X_BEARER_TOKEN|GROK_API_KEY)=(.+)$/);
    if (m) process.env[m[1]] = m[2].trim();
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
  requireEnv("GROK_API_KEY");
  // X is optional; test can run without X if not set

  const injectContradiction = process.argv.includes("--inject-contradiction");

  const res = await runDagAgent(
    "Tokyo",
    4000,
    [],
    {
      bookingDates: { startDate: "2025-12-10", endDate: "2025-12-15" },
      useX: false,
      injectContradiction,
    },
    undefined
  );

  console.log("=== DAG Agent Smoke ===");
  console.log("events:", res.events);
  console.log("history length:", res.history.length);
  console.log("agentMessage:", res.agentMessage);
  console.log("planMeta:", res.planMeta);
  if (res.planMetaHistory) console.log("planMetaHistory:", res.planMetaHistory);
  console.log(
    "last state summary keys:",
    Object.keys(res.history[res.history.length - 1].state.summary ?? {})
  );
  console.log("unknowns:", res.history[res.history.length - 1].state.unknowns);
  console.log(
    "bookings:",
    Object.values(res.history[res.history.length - 1].state.raw ?? {}).filter(
      (n: any) => n.type === "action"
    )
  );
  const contradictions = Object.values(res.history[res.history.length - 1].state.raw ?? {}).filter(
    (n: any) => Array.isArray((n as any).contradicts) && (n as any).contradicts.length > 0
  );
  console.log("contradictions:", contradictions);

  if (!res.history.length) throw new Error("No history produced");
  if (!res.events.length) throw new Error("No events produced");
  if (!res.agentMessage) throw new Error("No agent message produced");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
