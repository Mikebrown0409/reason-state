import type { Checkpoint, EchoState, Patch, StorageDriver } from "./types.js";

/**
 * Create a remote storage driver that mirrors the ReasonState storage contract using HTTP.
 * Expected endpoints (JSON):
 * - POST   {baseUrl}/checkpoints { state, turnId } -> { id, createdAt, turnId?, state? }
 * - GET    {baseUrl}/checkpoints/{id}             -> { id, createdAt, turnId?, state }
 * - POST   {baseUrl}/log { patches }               (fire-and-forget; tolerated best-effort)
 * - GET    {baseUrl}/log                           -> { patches: Patch[] } | Patch[]
 */
export function createRemoteStorageDriver(baseUrl: string): StorageDriver {
  const normalizedBase = baseUrl.replace(/\/+$/, "");

  async function saveCheckpoint(state: EchoState, _dbPath?: string, turnId?: string): Promise<Checkpoint> {
    const res = await fetch(`${normalizedBase}/checkpoints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, turnId }),
    });
    if (!res.ok) throw new Error(`saveCheckpoint failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as Partial<Checkpoint>;
    if (!json.id || !json.createdAt) throw new Error("saveCheckpoint missing id/createdAt");
    const cp: Checkpoint = {
      id: String(json.id),
      state,
      createdAt: String(json.createdAt),
      turnId: json.turnId ? String(json.turnId) : turnId,
    };
    return cp;
  }

  async function loadCheckpoint(id: string, _dbPath?: string): Promise<Checkpoint> {
    const res = await fetch(`${normalizedBase}/checkpoints/${id}`);
    if (!res.ok) throw new Error(`loadCheckpoint failed: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as Partial<Checkpoint>;
    if (!json.state || !json.createdAt) throw new Error("loadCheckpoint missing state/createdAt");
    return {
      id: String(json.id ?? id),
      state: json.state as EchoState,
      createdAt: String(json.createdAt),
      turnId: json.turnId ? String(json.turnId) : undefined,
    };
  }

  // Fire-and-forget; errors are logged but do not throw (mirrors sync API).
  function appendToLogSync(patches: Patch[], _logPath?: string): void {
    if (!patches.length) return;
    void fetch(`${normalizedBase}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patches }),
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.error("appendToLogSync remote error", err);
    });
  }

  async function readLog(_logPath?: string): Promise<Patch[]> {
    const res = await fetch(`${normalizedBase}/log`);
    if (!res.ok) throw new Error(`readLog failed: ${res.status} ${await res.text()}`);
    const json = await res.json();
    if (Array.isArray(json)) return json as Patch[];
    if (json && Array.isArray(json.patches)) return json.patches as Patch[];
    throw new Error("readLog invalid response");
  }

  return {
    saveCheckpoint,
    loadCheckpoint,
    appendToLogSync,
    readLog,
  };
}

