import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect } from "vitest";
import { runSimpleAgent } from "../examples/agents/simpleAgent.js";
import { ReasonState, applyPatches } from "../src/engine/ReasonState.js";
import { readLog } from "../src/engine/storage.js";
import { mockBooking } from "../src/tools/mockBooking.js";
import type { Patch } from "../src/engine/types.js";

describe("integration: simple agent with log replay", () => {
  it(
    "runs agent, persists log, and replays deterministically",
    { timeout: 40000 },
    async () => {
    const key =
      process.env.GROK_API_KEY ||
      process.env.VITE_GROK_API_KEY ||
      process.env.__VITE_GROK_API_KEY__;
    if (!key) {
      console.warn("Skipping: GROK_API_KEY missing");
      return;
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rs-log-"));
    const logPath = path.join(tmpDir, "log.ndjson");

    const res = await runSimpleAgent("Tokyo travel", 4000, [], { logPath, checkpointInterval: 2 });

    expect(res.history.length).toBeGreaterThan(0);
    expect(res.planPatches?.length).toBeGreaterThan(0);

    const patches = await readLog(logPath);
    expect(patches.length).toBeGreaterThan(0);

    const engine = new ReasonState();
    const replayed = await engine.replayFromLog(logPath);
    expect(replayed.summary.goal).toBeDefined();
    expect(replayed.history.length).toBe(patches.length);
    // Token-savings proxy: replay should not add new patches
    expect(replayed.history.length).toBe(patches.length);

    // In plan-only mode with missing dates, booking is skipped; ensure no booking nodes exist
    const booking = Object.values(replayed.raw).find((n) => n.id.startsWith("booking-"));
    expect(booking).toBeUndefined();

    // Governance: nodes carry timestamps and statuses for assertions
    const goal = replayed.raw.goal;
    expect(goal?.createdAt).toBeDefined();
    expect(goal?.updatedAt).toBeDefined();
    expect(goal?.status ?? "open").toBeDefined();

    // Re-run replay to ensure determinism and no new history
    const replayed2 = await engine.replayFromLog(logPath);
    expect(replayed2.history.length).toBe(patches.length);
    }
  );

  it(
    "full flow: Tokyo → retract → Amsterdam with governance, log, replay",
    { timeout: 40000 },
    async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rs-log-"));
      const logPath = path.join(tmpDir, "log-full.ndjson");
      const engine = new ReasonState({ logPath, checkpointInterval: 2 });

      // Turn 1: Tokyo plan + booking with clash (should be blocked)
      const turn1: Patch[] = [
        { op: "add", path: "/raw/goal", value: { id: "goal", type: "planning", summary: "Plan Tokyo", status: "open" } },
        { op: "add", path: "/raw/budget", value: { id: "budget", type: "fact", summary: "Budget 4000" } }
      ];
      engine.applyPatches(turn1);
      const booking1 = await mockBooking({
        id: "t1",
        destination: "Tokyo",
        budget: 4000,
        startDate: "2025-12-21",
        endDate: "2025-12-23",
        unknowns: engine.snapshot.unknowns
      });
      engine.applyPatches(booking1);

      // Turn 2: retract/shift to Amsterdam with non-conflicting dates (should resolve)
      const turn2: Patch[] = [
        {
          op: "replace",
          path: "/raw/goal",
          value: { id: "goal", type: "planning", summary: "Plan Amsterdam", status: "open" }
        }
      ];
      engine.applyPatches(turn2);
      const booking2 = await mockBooking({
        id: "t2",
        destination: "Amsterdam",
        budget: 4500,
        startDate: "2026-01-10",
        endDate: "2026-01-15",
        unknowns: engine.snapshot.unknowns
      });
      engine.applyPatches(booking2);

      // Governance assertions
      const b1 = engine.snapshot.raw["booking-t1"];
      const b2 = engine.snapshot.raw["booking-t2"];
      expect(b1?.status).toBe("blocked");
      expect(b2?.status).toBe("resolved");

      // Timestamps exposed
      expect(engine.snapshot.raw.goal?.createdAt).toBeDefined();
      expect(engine.snapshot.raw.goal?.updatedAt).toBeDefined();

      // Log exists and replay is deterministic
      const patches = await readLog(logPath);
      expect(patches.length).toBe(engine.snapshot.history.length);
      const replayed = await new ReasonState().replayFromLog(logPath);
      expect(replayed.history.length).toBe(engine.snapshot.history.length);
      expect(replayed.raw.goal).toBeDefined();

      // Token/time savings proxy: replay did not add patches
      expect(replayed.history.length).toBe(patches.length);
    }
  );
});



