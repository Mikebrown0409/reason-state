export type NodeType = "fact" | "unknown" | "assumption" | "action" | "planning";

export type NodeStatus = "open" | "blocked" | "resolved" | "dirty";

export type AssumptionStatus = "valid" | "retracted" | "superseded" | "unknown" | "resolved";

export interface Patch {
  op: "add" | "replace";
  path: string;
  value?: unknown;
  reason?: string;
}

export interface StateNode {
  id: string;
  type: NodeType;
  summary?: string;
  details?: unknown;
  dependsOn?: string[];
  contradicts?: string[];
  temporalAfter?: string[];
  temporalBefore?: string[];
  sourceId?: string;
  sourceType?: string;
  parentId?: string;
  children?: string[];
  status?: NodeStatus;
  assumptionStatus?: AssumptionStatus;
  dirty?: boolean;
  createdAt?: string;
  updatedAt?: string;
  history?: Patch[];
}

export interface AssumptionMeta {
  id: string;
  sourceId?: string;
  status: AssumptionStatus;
  expiresAt?: string;
  createdAt?: string;
  updatedAt?: string;
  summary?: string;
}

export interface EchoState {
  raw: Record<string, StateNode>;
  summary: Record<string, string>;
  assumptions: string[];
  unknowns: string[];
  history: Patch[];
  checkpoints?: Record<string, Checkpoint>;
  checkpointId?: string;
}

export interface Checkpoint {
  id: string;
  state: EchoState;
  createdAt: string;
  turnId?: string;
}

export interface ReasonStateOptions {
  dbPath?: string;
  logPath?: string;
  checkpointInterval?: number;
  grok?: unknown;
}

// Helpers to make inline tests readable and provide a clean starting state.
export function createEmptyState(): EchoState {
  return {
    raw: {},
    summary: {},
    assumptions: [],
    unknowns: [],
    history: [],
    checkpoints: {},
  };
}

// Inline sanity checks (console.assert) to guard lifecycle expectations.
(() => {
  const state = createEmptyState();

  // Unknown gating: unknown nodes should be tracked separately.
  const unknownNode: StateNode = {
    id: "u1",
    type: "unknown",
    status: "blocked",
    dirty: true,
  };
  state.raw[unknownNode.id] = unknownNode;
  state.unknowns.push(unknownNode.id);
  console.assert(state.unknowns.includes("u1"), "unknown node must register in unknowns list");

  // Assumption lifecycle: valid -> superseded -> retracted.
  const assumption: AssumptionMeta = {
    id: "a1",
    status: "valid",
    createdAt: "2025-01-01T00:00:00Z",
  };
  console.assert(assumption.status === "valid", "assumption starts valid");
  assumption.status = "superseded";
  console.assert(assumption.status === "superseded", "assumption can be superseded");
  assumption.status = "retracted";
  console.assert(assumption.status === "retracted", "assumption can be retracted");

  // Patch typing: add/replace carry value.
  const addPatch: Patch = { op: "add", path: "/raw/u1", value: unknownNode };
  console.assert(addPatch.value !== undefined, "add/replace carry value");
})();
