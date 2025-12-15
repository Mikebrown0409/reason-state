const ALLOWED_NODE_TYPES = new Set([
  "fact",
  "assumption",
  "unknown",
  "action",
  "planning",
  "decision",
]);
const ALLOWED_STATUS = new Set(["open", "blocked", "resolved", "dirty", "archived"]);
const ALLOWED_ASSUMPTION_STATUS = new Set(["valid", "invalid", "retracted", "expired", "resolved"]);

function validateNodeShape(bucket: "raw" | "summary", id: string, value: unknown): void {
  if (bucket === "summary") {
    if (typeof value !== "string") {
      throw new Error(`summary value must be string for ${id}`);
    }
    return;
  }

  if (!value || typeof value !== "object") {
    throw new Error(`raw value must be object for ${id}`);
  }

  const v = value as Record<string, unknown>;
  const type = v.type;
  if (!ALLOWED_NODE_TYPES.has(type as string)) {
    throw new Error(`invalid node type for ${id}: ${String(type)}`);
  }
  if (v.id && v.id !== id) {
    throw new Error(`value.id must match path id (${id})`);
  }
  if (v.status !== undefined && !ALLOWED_STATUS.has(v.status as string)) {
    throw new Error(`invalid status for ${id}: ${String(v.status)}`);
  }
  if (
    v.assumptionStatus !== undefined &&
    !ALLOWED_ASSUMPTION_STATUS.has(v.assumptionStatus as string)
  ) {
    throw new Error(`invalid assumptionStatus for ${id}: ${String(v.assumptionStatus)}`);
  }
  if (
    v.details !== undefined &&
    (typeof v.details !== "object" || v.details === null || Array.isArray(v.details))
  ) {
    throw new Error(`details must be an object for ${id}`);
  }

  const allowedKeys = new Set([
    "id",
    "type",
    "summary",
    "details",
    "status",
    "assumptionStatus",
    "dirty",
    "sourceType",
    "sourceId",
    "dependsOn",
    "contradicts",
    "temporalAfter",
    "temporalBefore",
    "parentId",
    "children",
    "createdAt",
    "updatedAt",
  ]);
  for (const key of Object.keys(v)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`unexpected field '${key}' in raw node ${id}`);
    }
  }
}
import {
  applyReconciliation,
  canExecute,
  detectContradictions,
  propagateDirty,
} from "./reconciliation.js";
import { appendToLogSync, loadCheckpoint, readLog, saveCheckpoint } from "./storage.js";
import { memoryStorage } from "./storageMemory.js";
import type {
  EchoState,
  Patch,
  Checkpoint,
  ReasonStateOptions,
  StateNode,
  StorageDriver,
} from "./types.js";
import { createEmptyState } from "./types.js";
import { validatePatch } from "./patchSchema.js";

export class ReasonState {
  private state: EchoState;
  private readonly options: ReasonStateOptions;
  private patchesSinceCheckpoint = 0;
  private readonly storage: StorageDriver;

  constructor(options: ReasonStateOptions = {}, initialState?: EchoState) {
    this.options = options;
    const isBrowser = typeof window !== "undefined";
    if (options.storage) {
      this.storage = options.storage;
    } else if (isBrowser) {
      this.storage = memoryStorage;
    } else {
      this.storage = {
        saveCheckpoint,
        loadCheckpoint,
        appendToLogSync,
        readLog,
      };
    }
    this.state = initialState ?? {
      raw: {},
      summary: {},
      assumptions: [],
      unknowns: [],
      history: [],
    };
  }

  get snapshot(): EchoState {
    return this.state;
  }

  canExecute(type: string): boolean {
    return canExecute(type as any, this.state);
  }

  applyPatches(patches: Patch[]): EchoState {
    this.state = applyPatches(patches, this.state);
    this.patchesSinceCheckpoint += patches.length;
    if (this.options.logPath) {
      this.storage.appendToLogSync(patches, this.options.logPath);
    }
    return this.state;
  }

  retractAssumption(id: string): EchoState {
    this.state = retractAssumption(id, this.state);
    return this.state;
  }

  async selfHealAndReplay(fromCheckpoint?: string): Promise<EchoState> {
    this.state = await selfHealAndReplay(this.state, fromCheckpoint);
    return this.state;
  }

  async checkpoint(turnId?: string): Promise<Checkpoint> {
    const cp = await this.storage.saveCheckpoint(this.state, this.options.dbPath, turnId);
    this.state.checkpointId = cp.id;
    this.patchesSinceCheckpoint = 0;
    return cp;
  }

  async applyPatchesWithCheckpoint(
    patches: Patch[],
    turnId?: string
  ): Promise<{ state: EchoState; checkpoint?: Checkpoint }> {
    const state = this.applyPatches(patches);
    const checkpoint = await this.checkpointIfNeeded(turnId);
    return { state, checkpoint };
  }

  async checkpointIfNeeded(turnId?: string): Promise<Checkpoint | undefined> {
    if (!this.options.checkpointInterval) return undefined;
    if (this.patchesSinceCheckpoint < this.options.checkpointInterval) return undefined;
    return this.checkpoint(turnId);
  }

  async restore(id: string): Promise<EchoState> {
    const cp = await this.storage.loadCheckpoint(id, this.options.dbPath);
    this.state = cp.state;
    return this.state;
  }

  /**
   * Rebuild state from an append-only log file (or in-memory log if no path).
   * Optionally starts from an empty state or provided base.
   */
  async replayFromLog(logPath?: string, baseState?: EchoState): Promise<EchoState> {
    const patches = await this.storage.readLog(logPath);
    this.state = replayHistory(patches, baseState ?? createEmptyState());
    return this.state;
  }

  /**
   * Replay the current patch history from an optional checkpoint id.
   * If no checkpoint provided or found, replays from an empty state.
   */
  replay(fromCheckpoint?: string): EchoState {
    const base =
      (fromCheckpoint && this.state.checkpoints?.[fromCheckpoint]?.state) || createEmptyState();
    const rebuilt = replayHistory(this.state.history ?? [], base);
    this.state = rebuilt;
    return this.state;
  }
}

// Standalone helpers to keep API surface aligned with spec.
export function applyPatches(patches: Patch[], state: EchoState): EchoState {
  const next = cloneState(state);
  const touched = new Set<string>();
  const knownRaw = new Set(Object.keys(next.raw ?? {}));
  const knownSummary = new Set(Object.keys(next.summary ?? {}));
  const stagedRaw = new Set<string>();
  const stagedSummary = new Set<string>();

  // Pre-scan adds to allow replace-after-add in a single batch.
  for (const p of patches) {
    const m = p.path.match(/^\/(raw|summary)\/([^/]+)$/);
    if (m && p.op === "add") {
      const bucket = m[1];
      const id = m[2];
      if (bucket === "raw") stagedRaw.add(id);
      else stagedSummary.add(id);
    }
  }

  for (const patch of patches) {
    validatePatch(patch);
    const normalized = normalizePatchIds(patch, knownRaw, knownSummary, stagedRaw, stagedSummary);
    const bucketMatch = normalized.path.match(/^\/(raw|summary)\/([^/]+)$/);
    if (bucketMatch) {
      validateNodeShape(bucketMatch[1] as "raw" | "summary", bucketMatch[2], normalized.value);
    }
    setByPath(next, normalized.path, normalized.value);
    next.history.push(normalized);
    const nodeId = extractNodeId(normalized.path);
    if (nodeId) touched.add(nodeId);
  }

  propagateDirty(next, Array.from(touched));
  resyncLists(next);
  return applyReconciliation(next);
}

export function retractAssumption(id: string, state: EchoState): EchoState {
  const next = cloneState(state);
  const node = next.raw[id];
  if (!node || node.type !== "assumption") return state;
  node.assumptionStatus = "retracted";
  node.status = "blocked";
  node.dirty = true;
  next.assumptions = next.assumptions.filter((a) => a !== id);
  next.history.push({
    op: "replace",
    path: `/raw/${id}`,
    value: node,
    reason: "retractAssumption",
  });
  return applyReconciliation(propagateDirty(next, [id]));
}

export async function selfHealAndReplay(
  state: EchoState,
  fromCheckpoint?: string
): Promise<EchoState> {
  let base = cloneState(state);
  if (fromCheckpoint && base.checkpoints?.[fromCheckpoint]) {
    base = cloneState(base.checkpoints[fromCheckpoint].state);
  }
  const contradictions = detectContradictions(base);
  const patches: Patch[] = [];
  for (const id of contradictions) {
    const node = base.raw[id];
    if (!node) continue;
    node.status = "resolved";
    node.assumptionStatus = node.assumptionStatus ?? "resolved";
    node.dirty = true;
    patches.push({
      op: "replace",
      path: `/raw/${id}`,
      value: node,
      reason: "selfHeal:contradiction",
    });
  }
  const healed = applyPatches(patches, base);
  return healed;
}

export { canExecute };

export function replayHistory(history: Patch[], baseState?: EchoState): EchoState {
  const base = cloneState(baseState ?? createEmptyState());
  return applyPatches(history, base);
}

function cloneState(state: EchoState): EchoState {
  return JSON.parse(JSON.stringify(state)) as EchoState;
}

function extractNodeId(path: string): string | null {
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "raw" && parts[1]) return parts[1];
  return null;
}

function generateId(): string {
  const gcrypto = typeof globalThis !== "undefined" ? (globalThis as any).crypto : undefined;
  if (gcrypto && typeof gcrypto.randomUUID === "function") {
    return gcrypto.randomUUID();
  }
  return `rs-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizePatchIds(
  patch: Patch,
  knownRaw: Set<string>,
  knownSummary: Set<string>,
  stagedRaw: Set<string>,
  stagedSummary: Set<string>
): Patch {
  const match = patch.path.match(/^\/(raw|summary)\/([^/]+)$/);
  if (!match) throw new Error(`invalid patch path: ${patch.path}`);
  const bucket = match[1] as "raw" | "summary";
  const pathId = match[2];

  if (patch.op === "replace") {
    const exists =
      bucket === "raw"
        ? knownRaw.has(pathId) || stagedRaw.has(pathId)
        : knownSummary.has(pathId) ||
          stagedSummary.has(pathId) ||
          knownRaw.has(pathId) ||
          stagedRaw.has(pathId);
    if (!exists) {
      throw new Error(`replace target does not exist: ${patch.path}`);
    }
    return patch;
  }

  // For add: keep the path id as canonical; ensure value.id matches for raw.
  const newId = pathId;

  const newPath = `/${bucket}/${newId}`;
  let newValue = patch.value;
  if (bucket === "raw" && patch.value && typeof patch.value === "object") {
    const providedId = (patch.value as any).id;
    if (providedId !== undefined && providedId !== newId) {
      throw new Error(`value.id must match path id (${newId})`);
    }
    newValue = { ...(patch.value as any), id: newId };
  }

  if (bucket === "raw") {
    knownRaw.add(newId);
  } else {
    knownSummary.add(newId);
  }

  return { ...patch, path: newPath, value: newValue };
}

function setByPath(state: EchoState, path: string, value: unknown): void {
  const segments = path.split("/").filter(Boolean);
  if (segments[0] === "raw" && segments[1]) {
    state.raw[segments[1]] = stampTimestamps(value, state.raw[segments[1]]);
  } else if (segments[0] === "summary" && segments[1]) {
    state.summary[segments[1]] = String(value);
  }
}

function resyncLists(state: EchoState): void {
  state.unknowns = Object.values(state.raw)
    .filter((n) => n.type === "unknown" && n.status !== "resolved")
    .map((n) => n.id);
  state.assumptions = Object.values(state.raw)
    .filter((n) => n.type === "assumption" && n.assumptionStatus !== "retracted")
    .map((n) => n.id);
}

function stampTimestamps(value: unknown, prior?: StateNode): StateNode {
  const now = new Date().toISOString();
  const base: StateNode =
    (value && typeof value === "object" ? (value as StateNode) : ({} as StateNode)) ??
    ({} as StateNode);
  if (!prior?.createdAt) {
    base.createdAt = base.createdAt ?? now;
  } else {
    base.createdAt = prior.createdAt;
  }
  let updated = now;
  if (base.updatedAt && base.updatedAt !== prior?.updatedAt) {
    updated = base.updatedAt;
  } else if (prior?.updatedAt === now) {
    updated = new Date(Date.now() + 1).toISOString();
  }
  base.updatedAt = updated;
  return base;
}
