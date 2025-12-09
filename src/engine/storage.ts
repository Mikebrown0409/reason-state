import fs from "fs";
import path from "path";
import type { Checkpoint, EchoState, Patch } from "./types.js";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Database from "better-sqlite3";

const DEFAULT_DB = ":memory:";
const isBrowser = typeof window !== "undefined";
const memStore = new Map<string, Checkpoint>();
const memLog: Patch[] = [];

export async function saveCheckpoint(
  state: EchoState,
  dbPath = DEFAULT_DB,
  turnId?: string
): Promise<Checkpoint> {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  // Use in-memory store for browser and for default ":memory:" to avoid per-connection SQLite isolation.
  if (isBrowser || dbPath === DEFAULT_DB) {
    const checkpoint: Checkpoint = { id, state, createdAt, turnId };
    memStore.set(id, checkpoint);
    if (!state.checkpoints) state.checkpoints = {};
    state.checkpoints[id] = checkpoint;
    return checkpoint;
  }

  const db = await open(dbPath);
  db.prepare("INSERT INTO checkpoints (id, payload, createdAt, turnId) VALUES (?, ?, ?, ?)").run(
    id,
    JSON.stringify(state),
    createdAt,
    turnId ?? null
  );
  const checkpoint: Checkpoint = { id, state, createdAt, turnId };
  if (!state.checkpoints) state.checkpoints = {};
  state.checkpoints[id] = checkpoint;
  return checkpoint;
}

export async function loadCheckpoint(id: string, dbPath = DEFAULT_DB): Promise<Checkpoint> {
  if (isBrowser || dbPath === DEFAULT_DB) {
    const cp = memStore.get(id);
    if (!cp) throw new Error(`Checkpoint not found: ${id}`);
    return cp;
  }

  const db = await open(dbPath);
  const row = db.prepare("SELECT payload, createdAt, turnId FROM checkpoints WHERE id = ?").get(id);
  if (!row) throw new Error(`Checkpoint not found: ${id}`);
  const state: EchoState = JSON.parse(row.payload);
  return { id, state, createdAt: row.createdAt, turnId: row.turnId ?? undefined };
}

export function appendToLogSync(patches: Patch[], logPath?: string): void {
  if (!patches.length) return;
  if (isBrowser || !logPath) {
    memLog.push(...patches);
    return;
  }
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const payload = patches.map((p) => JSON.stringify(p)).join("\n") + "\n";
  fs.appendFileSync(logPath, payload, "utf8");
}

export async function readLog(logPath?: string): Promise<Patch[]> {
  if (isBrowser || !logPath) return [...memLog];
  try {
    const data = await fs.promises.readFile(logPath, "utf8");
    return data
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Patch);
  } catch {
    return [];
  }
}

async function open(dbPath: string) {
  const { default: Database } = await import("better-sqlite3");
  const db = new Database(dbPath);
  db.prepare(
    "CREATE TABLE IF NOT EXISTS checkpoints (id TEXT PRIMARY KEY, payload TEXT, createdAt TEXT, turnId TEXT)"
  ).run();
  return db;
}

// Inline assertions for checkpoint safety (node only).
(() => {
  if (isBrowser) return;
  const state: EchoState = {
    raw: {},
    summary: {},
    assumptions: [],
    unknowns: [],
    history: [],
    checkpoints: {},
  };
  saveCheckpoint(state).then((cp) => {
    console.assert(cp.id, "checkpoint must have id");
    loadCheckpoint(cp.id).then((loaded) => {
      console.assert(loaded.id === cp.id, "loaded checkpoint id matches");
    });
  });
})();
