import type { EchoState, NodeType, StateNode } from "./types.js";

export function propagateDirty(state: EchoState, nodeIds: string[]): EchoState {
  const queue = [...nodeIds];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const node = state.raw[id];
    if (!node) continue;
    node.dirty = true;
    neighbors(state, id).forEach((n) => queue.push(n));
  }
  return state;
}

// Detect contradictions by scanning nodes that explicitly reference conflicts.
export function detectContradictions(state: EchoState): string[] {
  const contradictions: Set<string> = new Set();
  for (const node of Object.values(state.raw)) {
    const details = node.details as Record<string, unknown> | undefined;
    const conflictingId = details?.contradicts as string | undefined;
    if (conflictingId && state.raw[conflictingId]) {
      contradictions.add(node.id);
      contradictions.add(conflictingId);
    }
  }
  return Array.from(contradictions);
}

export function canExecute(type: NodeType, state: EchoState): boolean {
  if (state.unknowns.length > 0) return false;
  const hasDirty = Object.values(state.raw).some((n) => n.dirty);
  if (hasDirty) return false;
  if (type === "action") {
    const invalidAssumption = Object.values(state.raw).some(
      (n) => n.type === "assumption" && n.assumptionStatus && n.assumptionStatus !== "valid"
    );
    if (invalidAssumption) return false;
  }
  return true;
}

// Minimal reconciliation: clears dirty flags after semantic activation stub.
export function applyReconciliation(state: EchoState): EchoState {
  // Mark contradictions dirty so gating sees them; self-heal can resolve later.
  const contradictions = detectContradictions(state);
  if (contradictions.length) {
    propagateDirty(state, contradictions);
  }

  for (const node of Object.values(state.raw)) {
    if (node.dirty) {
      node.summary = node.summary ?? stringifyDetails(node);
      node.dirty = false;
    }
  }
  return state;
}

function stringifyDetails(node: StateNode): string {
  if (typeof node.details === "string") return node.details;
  try {
    return JSON.stringify(node.details);
  } catch {
    return "";
  }
}

function neighbors(state: EchoState, id: string): string[] {
  const node = state.raw[id];
  if (!node) return [];
  const adj = new Set<string>();
  if (node.parentId) adj.add(node.parentId);
  (node.children ?? []).forEach((c) => adj.add(c));
  const details = node.details as Record<string, unknown> | undefined;
  const conflictingId = details?.contradicts as string | undefined;
  if (conflictingId && state.raw[conflictingId]) adj.add(conflictingId);
  // reverse contradiction edges
  for (const other of Object.values(state.raw)) {
    const otherConflicts = (other.details as Record<string, unknown> | undefined)?.contradicts;
    if (otherConflicts === id) adj.add(other.id);
  }
  return Array.from(adj);
}

