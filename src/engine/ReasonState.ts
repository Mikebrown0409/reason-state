import { applyReconciliation, canExecute, detectContradictions, propagateDirty } from "./reconciliation.js";
import { loadCheckpoint, saveCheckpoint } from "./storage.js";
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
    return cp;
  }

  async restore(id: string): Promise<EchoState> {
    const cp = await loadCheckpoint(id, this.options.dbPath);
    this.state = cp.state;
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

  for (const patch of patches) {
    validatePatch(patch);
    if (patch.op === "remove") {
      removeByPath(next, patch.path);
    } else {
      setByPath(next, patch.path, patch.value);
    }
    next.history.push(patch);
    const nodeId = extractNodeId(patch.path);
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

function removeByPath(state: EchoState, path: string): void {
  const segments = path.split("/").filter(Boolean);
  if (segments[0] === "raw" && segments[1]) {
    delete state.raw[segments[1]];
  }
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

