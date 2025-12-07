import { runDemoFlow } from "./DemoApp.js";
import { ReasonState, applyPatches, retractAssumption } from "../src/engine/ReasonState.js";
import { createDemoAgent } from "../src/adapters/langGraphAdapter.js";
import { mockBooking } from "../src/tools/mockBooking.js";

// Inline console.assert coverage for end-to-end behaviors.
(async () => {
  const result = await runDemoFlow();
  console.assert(result.events.length === 5, "demo flow should emit 5 events");
})();

// Unknown gating scenario.
(() => {
  const engine = new ReasonState();
  applyPatches(
    [{ op: "add", path: "/raw/u-block", value: { id: "u-block", type: "unknown", status: "blocked" } }],
    engine.snapshot
  );
  const canAct = engine.canExecute("action");
  console.assert(canAct === false, "unknown blocks execution");
})();

// Assumption retract + budget prune.
(() => {
  const engine = new ReasonState();
  applyPatches(
    [
      { op: "add", path: "/raw/assumption-dest", value: { id: "assumption-dest", type: "assumption", assumptionStatus: "valid" } },
      { op: "add", path: "/raw/budget", value: { id: "budget", type: "fact", details: { amount: 4500 } } }
    ],
    engine.snapshot
  );
  retractAssumption("assumption-dest", engine.snapshot);
  applyPatches([{ op: "replace", path: "/raw/budget", value: { id: "budget", type: "fact", details: { amount: 4000 } } }], engine.snapshot);
  console.assert(engine.snapshot.raw.budget?.details?.["amount"] === 4000, "budget reverted without deleting node");
})();

// Adapter gating should block when dirty/unknown present.
(() => {
  const engine = new ReasonState();
  applyPatches(
    [{ op: "add", path: "/raw/u-block", value: { id: "u-block", type: "unknown", status: "blocked" } }],
    engine.snapshot
  );
  const graph = createDemoAgent(engine);
  graph.invoke({ intent: "book", type: "action" }).then((out: any) => {
    console.assert(out.intent === "blocked", "adapter should block when unknown exists");
  });
})();

// Booking tool blocks then unblocks when unknowns cleared.
(async () => {
  const blocked = await mockBooking({ id: "t1", unknowns: ["u1"] });
  console.assert(blocked[0]?.value?.["status"] === "blocked", "booking should block on unknowns");
  const ok = await mockBooking({ id: "t1", destination: "Amsterdam", budget: 4000 });
  console.assert(ok[0]?.value?.["status"] === "resolved", "booking should resolve when unknowns cleared");
})();

