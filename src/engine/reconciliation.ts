import type { EchoState, NodeType, StateNode, Patch } from "./types.js";

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
    (node.contradicts ?? []).forEach((cid) => {
      if (state.raw[cid]) {
        contradictions.add(node.id);
        contradictions.add(cid);
      }
    });
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

  // Block nodes whose dependencies (depends_on/temporalAfter/temporalBefore) are missing or dirty; unblock when deps are satisfied.
  for (const node of Object.values(state.raw)) {
    const deps = collectDeps(node);
    if (deps.length > 0) {
      const unmet = deps.some((dep) => {
        return !depSatisfied(state, node, dep);
      });
      if (unmet) {
        node.status = "blocked";
        node.dirty = true;
      } else if (node.status === "blocked" || node.status === "dirty") {
        node.status = "open";
        node.dirty = true;
      }
    }
  }

  // Resolve contradiction sets by recency (newest wins, others blocked).
  resolveContradictionsByRecency(state, contradictions);

  for (const node of Object.values(state.raw)) {
    if (node.dirty) {
      node.summary = node.summary ?? stringifyDetails(node);
    }
    // If an action is blocked due to an explicit conflict, keep it clean so it doesn't gate future runs.
    const details = node.details as Record<string, unknown> | undefined;
    if (node.type === "action" && node.status === "blocked" && details?.conflict) {
      node.dirty = false;
    }
  }

  // Clear dirty for nodes that are not blocked and whose deps are satisfied.
  for (const node of Object.values(state.raw)) {
    const deps = collectDeps(node);
    const depsSatisfied = deps.every((dep) => depSatisfied(state, node, dep));
    if (node.status !== "blocked" && depsSatisfied) {
      node.dirty = false;
    }
  }

  // Final unblock pass after clearing dirties.
  for (const node of Object.values(state.raw)) {
    const deps = collectDeps(node);
    if (node.status === "blocked" && deps.length > 0) {
      const depsSatisfied = deps.every((dep) => depSatisfied(state, node, dep));
      if (depsSatisfied) {
        node.status = "open";
        node.dirty = false;
      }
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
  collectDeps(node).forEach((d) => adj.add(d));
  (node.contradicts ?? []).forEach((c) => adj.add(c));
  (node.temporalAfter ?? []).forEach((t) => adj.add(t));
  (node.temporalBefore ?? []).forEach((t) => adj.add(t));
  const details = node.details as Record<string, unknown> | undefined;
  const conflictingId = details?.contradicts as string | undefined;
  if (conflictingId && state.raw[conflictingId]) adj.add(conflictingId);
  // reverse contradiction edges
  for (const other of Object.values(state.raw)) {
    const otherConflicts = (other.details as Record<string, unknown> | undefined)?.contradicts;
    if (otherConflicts === id) adj.add(other.id);
    (other.contradicts ?? []).forEach((c) => {
      if (c === id) adj.add(other.id);
    });
    (other.dependsOn ?? []).forEach((d) => {
      if (d === id) adj.add(other.id);
    });
    (other.temporalAfter ?? []).forEach((t) => {
      if (t === id) adj.add(other.id);
    });
    (other.temporalBefore ?? []).forEach((t) => {
      if (t === id) adj.add(other.id);
    });
  }
  return Array.from(adj);
}

function resolveContradictionsByRecency(state: EchoState, ids: string[]): void {
  if (ids.length < 2) return;
  const visited = new Set<string>();
  for (const id of ids) {
    if (visited.has(id)) continue;
    const node = state.raw[id];
    if (!node) continue;
    const neighbors = new Set<string>();
    (node.contradicts ?? []).forEach((c) => neighbors.add(c));
    Object.values(state.raw)
      .filter((n) => (n.contradicts ?? []).includes(id))
      .forEach((n) => neighbors.add(n.id));
    if (neighbors.size === 0) continue;
    neighbors.forEach((n) => visited.add(n));
    visited.add(id);

    const candidates = [id, ...neighbors].filter((n) => state.raw[n]);
    let winner = candidates[0];
    for (const cid of candidates.slice(1)) {
      if (isNewer(state.raw[cid], state.raw[winner])) winner = cid;
    }
    candidates.forEach((cid) => {
      const ref = state.raw[cid];
      if (!ref) return;
      if (cid === winner) {
        ref.status = ref.status ?? "open";
        ref.dirty = false;
      } else {
        ref.status = "blocked";
        ref.dirty = true;
      }
    });
  }
}

function isNewer(a?: StateNode, b?: StateNode): boolean {
  const ta = getTime(a);
  const tb = getTime(b);
  if (ta === undefined) return false;
  if (tb === undefined) return true;
  return ta > tb;
}

function getTime(n?: StateNode): number | undefined {
  const ts = n?.updatedAt ?? n?.createdAt;
  if (!ts) return undefined;
  const t = Date.parse(ts);
  return Number.isNaN(t) ? undefined : t;
}

function collectDeps(node: StateNode): string[] {
  return [...(node.dependsOn ?? []), ...(node.temporalAfter ?? []), ...(node.temporalBefore ?? [])];
}

export function collectDependents(state: EchoState, id: string): string[] {
  const dependents = new Set<string>();
  const queue = [id];
  const seen = new Set<string>();
  while (queue.length) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const node of Object.values(state.raw)) {
      if (!node) continue;
      const deps = collectDeps(node);
      if (deps.includes(current)) {
        if (!dependents.has(node.id)) {
          dependents.add(node.id);
          queue.push(node.id);
        }
      }
    }
  }
  return Array.from(dependents);
}

export function buildRollbackPatches(state: EchoState, id: string): Patch[] {
  const targets = new Set<string>([id, ...collectDependents(state, id)]);
  const patches: Patch[] = [];
  for (const tid of targets) {
    const node = state.raw[tid];
    if (!node) continue;
    patches.push({
      op: "replace",
      path: `/raw/${tid}`,
      value: {
        ...node,
        status: "blocked",
        dirty: true,
        summary: node.summary ?? "Rollback pending",
      },
    });
  }
  return patches;
}

function depSatisfied(state: EchoState, node: StateNode, dep: string): boolean {
  const target = state.raw[dep];
  const isTemporalBefore = (node.temporalBefore ?? []).includes(dep);
  if (!target) return false;
  if (isTemporalBefore) {
    return target.status === "resolved" && !target.dirty && !state.unknowns.includes(dep);
  }
  return !target.dirty && target.status !== "blocked" && !state.unknowns.includes(dep);
}
