import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRemoteStorageDriver } from "../src/engine/storageRemote.js";
import type { EchoState, Patch } from "../src/engine/types.js";

const baseUrl = "https://remote.test";

describe("createRemoteStorageDriver", () => {
  const state: EchoState = {
    raw: {},
    summary: {},
    history: [],
    assumptions: [],
    unknowns: [],
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("saves and loads checkpoints", async () => {
    const driver = createRemoteStorageDriver(baseUrl);

    const fetchMock = vi
      .spyOn(globalThis, "fetch" as any)
      // saveCheckpoint
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ id: "cp1", createdAt: "2025-01-01T00:00:00.000Z", turnId: "t1" }),
          { status: 200 }
        )
      )
      // loadCheckpoint
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "cp1",
            createdAt: "2025-01-01T00:00:00.000Z",
            state,
            turnId: "t1",
          }),
          { status: 200 }
        )
      );

    const cp = await driver.saveCheckpoint(state, undefined, "t1");
    expect(cp.id).toBe("cp1");
    expect(cp.turnId).toBe("t1");

    const loaded = await driver.loadCheckpoint("cp1");
    expect(loaded.id).toBe("cp1");
    expect(loaded.state).toEqual(state);

    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/checkpoints`,
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/checkpoints/cp1`);
  });

  it("appends and reads log", async () => {
    const driver = createRemoteStorageDriver(baseUrl);
    const patches: Patch[] = [{ op: "add", path: "/raw/a", value: { id: "a", type: "fact" } }];

    const fetchMock = vi
      .spyOn(globalThis, "fetch" as any)
      // appendToLogSync fire-and-forget
      .mockResolvedValueOnce(new Response("", { status: 200 }))
      // readLog
      .mockResolvedValueOnce(new Response(JSON.stringify({ patches }), { status: 200 }));

    driver.appendToLogSync(patches);
    const log = await driver.readLog();
    expect(log).toEqual(patches);

    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/log`,
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenCalledWith(`${baseUrl}/log`);
  });
});
