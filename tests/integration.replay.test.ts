import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect } from "vitest";
import { runSimpleAgent } from "../examples/agents/simpleAgent.js";
import { ReasonState } from "../src/engine/ReasonState.js";
import { readLog } from "../src/engine/storage.js";

describe("integration: simple agent with log replay", () => {
  it(
    "runs agent, persists log, and replays deterministically",
    { timeout: 20000 },
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

    const res = await runSimpleAgent("Tokyo travel", 4000, { logPath, checkpointInterval: 2 });

    expect(res.history.length).toBeGreaterThan(0);
    expect(res.planPatches?.length).toBeGreaterThan(0);

    const patches = await readLog(logPath);
    expect(patches.length).toBeGreaterThan(0);

    const engine = new ReasonState();
    const replayed = await engine.replayFromLog(logPath);
    expect(replayed.summary.goal).toBeDefined();
    expect(replayed.history.length).toBe(patches.length);

    // Booking should be blocked due to calendar clash (governance signal)
    const booking = Object.values(replayed.raw).find((n) => n.id.startsWith("booking-"));
    expect(booking?.status).toBe("blocked");
    }
  );
});



