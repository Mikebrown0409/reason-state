import type { Checkpoint, EchoState, Patch, StorageDriver } from "./types.js";

const memStore = new Map<string, Checkpoint>();
const memLog: Patch[] = [];

function makeId(): string {
  const g = (globalThis as any)?.crypto;
  if (g && typeof g.randomUUID === "function") return g.randomUUID();
  return `rs-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const memoryStorage: StorageDriver = {
  async saveCheckpoint(state: EchoState, _dbPath?: string, turnId?: string): Promise<Checkpoint> {
    const id = makeId();
    const createdAt = new Date().toISOString();
    const checkpoint: Checkpoint = { id, state, createdAt, turnId };
    memStore.set(id, checkpoint);
    if (!state.checkpoints) state.checkpoints = {};
    state.checkpoints[id] = checkpoint;
    return checkpoint;
  },

  async loadCheckpoint(id: string): Promise<Checkpoint> {
    const cp = memStore.get(id);
    if (!cp) throw new Error(`Checkpoint not found: ${id}`);
    return cp;
  },

  appendToLogSync(patches: Patch[]): void {
    if (!patches.length) return;
    memLog.push(...patches);
  },

  async readLog(): Promise<Patch[]> {
    return [...memLog];
  },
};
