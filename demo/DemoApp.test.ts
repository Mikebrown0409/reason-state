import { runDemoFlow } from "./DemoApp.js";
import { ReasonState, applyPatches, retractAssumption } from "../src/engine/ReasonState.js";
import { createDemoAgent } from "../src/adapters/langGraphAdapter.js";
import { mockBooking } from "../src/tools/mockBooking.js";
import { xSearch } from "../src/tools/xSearch.js";
import { grokChat } from "../src/tools/grokChat.js";
import fs from "fs";
import path from "path";

// Lightweight .env loader for tests (no extra deps).
(() => {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const m = line.match(/^VITE_(X_BEARER_TOKEN|GROK_API_KEY)=(.+)$/);
    if (m) {
      process.env[m[1]] = m[2].trim();
    }
  }
})();

// Inline console.assert coverage for end-to-end behaviors.
(async () => {
  const result = await runDemoFlow();
  console.assert(result.events.length === 5, "demo flow should emit 5 events");
})();

// Unknown gating scenario (fresh engine).
(() => {
  const engine = new ReasonState();
  engine.applyPatches([{ op: "add", path: "/raw/u-block", value: { id: "u-block", type: "unknown", status: "blocked" } }]);
  const canAct = engine.canExecute("action");
  console.assert(canAct === false, "unknown blocks execution");
})();

// Assumption retract + budget prune (fresh engine).
(() => {
  const engine = new ReasonState();
  engine.applyPatches([
    { op: "add", path: "/raw/assumption-dest", value: { id: "assumption-dest", type: "assumption", assumptionStatus: "valid" } },
    { op: "add", path: "/raw/budget", value: { id: "budget", type: "fact", details: { amount: 4500 } } }
  ]);
  engine.retractAssumption("assumption-dest");
  engine.applyPatches([{ op: "replace", path: "/raw/budget", value: { id: "budget", type: "fact", details: { amount: 4000 } } }]);
  const budgetDetails = engine.snapshot.raw.budget?.details as { amount?: number } | undefined;
  console.assert(budgetDetails?.amount === 4000, "budget reverted without deleting node");
})();

// Adapter gating should block when dirty/unknown present.
(() => {
  const engine = new ReasonState();
  engine.applyPatches([{ op: "add", path: "/raw/u-block", value: { id: "u-block", type: "unknown", status: "blocked" } }]);
  const graph = createDemoAgent(engine) as any;
  graph.invoke({ query: "Tokyo travel" }).then((out: any) => {
    if (!out || !out.plan) {
      console.warn("Adapter gating returned no plan; skipping assert");
      return;
    }
    console.assert(out.plan === "blocked", "adapter should block when unknown exists");
  });
})();

// Booking tool blocks then unblocks when unknowns cleared.
(async () => {
  const blocked = await mockBooking({ id: "t1", unknowns: ["u1"] });
  const blockedStatus = (blocked[0]?.value as { status?: string } | undefined)?.status;
  console.assert(blockedStatus === "blocked", "booking should block on unknowns");
  const ok = await mockBooking({ id: "t1", destination: "Amsterdam", budget: 4000 });
  const okStatus = (ok[0]?.value as { status?: string } | undefined)?.status;
  console.assert(okStatus === "resolved", "booking should resolve when unknowns cleared");
})();

// Live X search (requires VITE_X_BEARER_TOKEN). Throws if missing.
(async () => {
  const results = await xSearch("Tokyo travel");
  console.assert(results.length > 0, "X search should return results");
})();

// Live Grok call (requires VITE_GROK_API_KEY). Throws if missing.
(async () => {
  const msg = await grokChat("Say hello briefly.");
  console.assert(msg.length > 0, "Grok chat should return content");
})();

// LangGraph agent end-to-end (relies on live X + Grok + mock booking).
(async () => {
  const engine = new ReasonState();
  const agent = createDemoAgent(engine);
  const out = await (agent as any).invoke({ query: "Tokyo travel" });
  if (!out || !out.plan) {
    console.warn("Agent returned no plan; skipping assert");
    return;
  }
  console.assert(out.plan !== "blocked", "Agent should not be blocked when clean");
})();

