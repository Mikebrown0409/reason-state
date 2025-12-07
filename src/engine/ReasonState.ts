const ALLOWED_NODE_TYPES = new Set(["fact", "assumption", "unknown", "action", "planning", "decision"]);
const ALLOWED_STATUS = new Set(["open", "blocked", "resolved", "dirty"]);
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
  if (v.assumptionStatus !== undefined && !ALLOWED_ASSUMPTION_STATUS.has(v.assumptionStatus as string)) {
    throw new Error(`invalid assumptionStatus for ${id}: ${String(v.assumptionStatus)}`);
  }
  if (v.details !== undefined && (typeof v.details !== "object" || v.details === null || Array.isArray(v.details))) {
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
    "sourceId"
  ]);
  for (const key of Object.keys(v)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`unexpected field '${key}' in raw node ${id}`);
    }
  }
}
import { randomUUID as nodeRandomUUID } from "crypto";
import { applyReconciliation, canExecute, detectContradictions, propagateDirty } from "./reconciliation.js";
import { appendToLogSync, loadCheckpoint, readLog, saveCheckpoint } from "./storage.js";
import type {
  EchoState,
  Patch,
  Checkpoint,
  ReasonStateOptions
} from "./types.js";
import { createEmptyState } from "./types.js";
import { validatePatch } from "./patchSchema.js";

export class ReasonState {
  private state: EchoState;
  private readonly options: ReasonStateOptions;
  private patchesSinceCheckpoint = 0;

  constructor(options: ReasonStateOptions = {}, initialState?: EchoState) {
    this.options = options;
    this.state =
      initialState ??
      {
        raw: {},
        summary: {},
        assumptions: [],
        unknowns: [],
        history: []
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
      appendToLogSync(patches, this.options.logPath);
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
    const cp = await saveCheckpoint(this.state, this.options.dbPath, turnId);
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
    const cp = await loadCheckpoint(id, this.options.dbPath);
    this.state = cp.state;
    return this.state;
  }

  /**
   * Rebuild state from an append-only log file (or in-memory log if no path).
   * Optionally starts from an empty state or provided base.
   */
  async replayFromLog(logPath?: string, baseState?: EchoState): Promise<EchoState> {
    const patches = await readLog(logPath);
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

  for (const patch of patches) {
    validatePatch(patch);
    const normalized = normalizePatchIds(patch, knownRaw, knownSummary);
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
    reason: "retractAssumption"
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
      reason: "selfHeal:contradiction"
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
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  if (typeof nodeRandomUUID === "function") {
    return nodeRandomUUID();
  }
  return `rs-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizePatchIds(patch: Patch, knownRaw: Set<string>, knownSummary: Set<string>): Patch {
  const match = patch.path.match(/^\/(raw|summary)\/([^/]+)$/);
  if (!match) throw new Error(`invalid patch path: ${patch.path}`);
  const bucket = match[1] as "raw" | "summary";
  const pathId = match[2];

  if (patch.op === "replace") {
    const exists = bucket === "raw" ? knownRaw.has(pathId) : knownSummary.has(pathId);
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
    state.raw[segments[1]] = value as EchoState["raw"][string];
  } else if (segments[0] === "summary" && segments[1]) {
    state.summary[segments[1]] = String(value);
  }
}

function resyncLists(state: EchoState): void {
  state.unknowns = Object.values(state.raw)
    .filter((n) => n.type === "unknown")
    .map((n) => n.id);
  state.assumptions = Object.values(state.raw)
    .filter((n) => n.type === "assumption" && n.assumptionStatus !== "retracted")
    .map((n) => n.id);
}

// Inline assertions to ensure determinism and governance rules hold.
(() => {
  const base: EchoState = {
    raw: {},
    summary: {},
    assumptions: [],
    unknowns: [],
    history: [],
    checkpoints: {}
  };

  // Unknown blocks canExecute.
  base.raw.u1 = { id: "u1", type: "unknown", status: "blocked", dirty: true };
  base.unknowns = ["u1"];
  console.assert(canExecute("action", base) === false, "unknown should block actions");

  // applyPatches preserves append-only history and marks dirty.
  const after = applyPatches([{ op: "add", path: "/raw/f1", value: { id: "f1", type: "fact" } }], base);
  console.assert(after.history.length === 1, "history should append patches");
  console.assert(after.raw.f1?.dirty === false, "reconciliation clears dirty flags");

  // Retract assumption prunes list.
  const withAssumption = applyPatches(
    [{ op: "add", path: "/raw/a1", value: { id: "a1", type: "assumption", assumptionStatus: "valid" } }],
    base
  );
  const retracted = retractAssumption("a1", withAssumption);
  console.assert(!retracted.assumptions.includes("a1"), "retracted assumption removed from list");

  // selfHeal resolves contradictions deterministically.
  const conflict: EchoState = {
    raw: {
      f1: { id: "f1", type: "fact", details: { contradicts: "f2" } },
      f2: { id: "f2", type: "fact" }
    },
    summary: {},
    assumptions: [],
    unknowns: [],
    history: [],
    checkpoints: {}
  };
  selfHealAndReplay(conflict).then((healed) => {
    console.assert(healed.raw.f2?.status === "resolved", "contradicted node resolved");
  });
})();

