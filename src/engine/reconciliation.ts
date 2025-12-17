import type { EchoState, NodeType, StateNode, Patch } from "./types.js";

/**
 * Check if a node contains temporal anchors (dates, timestamps).
 * Temporal nodes are identified by:
 * - Containing date patterns in summary or details.text
 * - Having temporalAfter or temporalBefore edges
 * - Summary/details containing "Session date", "date:", or date-like patterns
 */
export function isTemporalNode(node: StateNode): boolean {
  const text = (node.summary ?? "") + " " + (typeof node.details === "object" && node.details !== null
    ? String((node.details as any).text ?? "")
    : String(node.details ?? ""));
  const lowerText = text.toLowerCase();
  
  // Check for date patterns
  const datePatterns = [
    /\b\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}\b/i,
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i,
    /\b\d{4}-\d{2}-\d{2}\b/, // ISO date
    /\bsession\s+date/i,
    /\bdate:\s*\d/i,
    /\b\d{1,2}\/\d{1,2}\/\d{4}\b/, // MM/DD/YYYY
  ];
  
  if (datePatterns.some(pattern => pattern.test(lowerText))) {
    return true;
  }
  
  // Nodes with temporal edges are likely temporal
  if ((node.temporalAfter?.length ?? 0) > 0 || (node.temporalBefore?.length ?? 0) > 0) {
    return true;
  }
  
  return false;
}

/**
 * Check if two temporal nodes refer to the same event instance.
 * They refer to the same event if:
 * - They share the same sourceId and sourceType (same session/event)
 * - They have the same parentId (sibling nodes in same context)
 * - They are explicitly linked via dependsOn (one depends on the other)
 */
export function isSameEvent(nodeA: StateNode, nodeB: StateNode): boolean {
  // Same source = same event
  if (nodeA.sourceId && nodeB.sourceId && nodeA.sourceId === nodeB.sourceId) {
    if (nodeA.sourceType && nodeB.sourceType && nodeA.sourceType === nodeB.sourceType) {
      return true;
    }
  }
  
  // Same parent = likely same event context
  if (nodeA.parentId && nodeB.parentId && nodeA.parentId === nodeB.parentId) {
    return true;
  }
  
  // One depends on the other = related to same event
  if ((nodeA.dependsOn ?? []).includes(nodeB.id) || (nodeB.dependsOn ?? []).includes(nodeA.id)) {
    return true;
  }
  
  return false;
}

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
// TEMPORAL SHIELD: Temporal nodes cannot contradict each other unless they refer to the same event.
export function detectContradictions(state: EchoState): string[] {
  const contradictions: Set<string> = new Set();
  for (const node of Object.values(state.raw)) {
    const details = node.details as Record<string, unknown> | undefined;
    const conflictingId = details?.contradicts as string | undefined;
    if (conflictingId && state.raw[conflictingId]) {
      const conflictingNode = state.raw[conflictingId];
      // TEMPORAL SHIELD: If both are temporal and NOT the same event, ignore the contradiction
      if (isTemporalNode(node) && conflictingNode && isTemporalNode(conflictingNode)) {
        if (!isSameEvent(node, conflictingNode)) {
          // Force-override: remove contradicts edge and create temporal edge instead
          // This happens in resolveContradictionsByRecency, but we skip adding to contradictions set
          continue;
        }
      }
      contradictions.add(node.id);
      contradictions.add(conflictingId);
    }
    (node.contradicts ?? []).forEach((cid) => {
      if (state.raw[cid]) {
        const conflictingNode = state.raw[cid];
        // TEMPORAL SHIELD: If both are temporal and NOT the same event, ignore the contradiction
        if (isTemporalNode(node) && conflictingNode && isTemporalNode(conflictingNode)) {
          if (!isSameEvent(node, conflictingNode)) {
            // Force-override: skip this contradiction
            return;
          }
        }
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
    
    // TEMPORAL SHIELD: Check if all candidates are temporal nodes referring to different events
    const allTemporal = candidates.every((cid) => {
      const candidate = state.raw[cid];
      return candidate && isTemporalNode(candidate);
    });
    
    if (allTemporal && candidates.length > 1) {
      // Check if any pair refers to the same event
      let hasSameEvent = false;
      for (let i = 0; i < candidates.length; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          const nodeA = state.raw[candidates[i]];
          const nodeB = state.raw[candidates[j]];
          if (nodeA && nodeB && isSameEvent(nodeA, nodeB)) {
            hasSameEvent = true;
            break;
          }
        }
        if (hasSameEvent) break;
      }
      
      // If all temporal nodes refer to different events, convert contradicts to temporal edges
      if (!hasSameEvent) {
        // Remove contradicts edges and create temporalAfter edges based on dates
        for (let i = 0; i < candidates.length; i++) {
          const nodeA = state.raw[candidates[i]];
          if (!nodeA) continue;
          
          // Remove contradicts edges to other temporal nodes
          const updatedContradicts = (nodeA.contradicts ?? []).filter((cid) => {
            const otherNode = state.raw[cid];
            if (!otherNode || !isTemporalNode(otherNode)) return true; // Keep non-temporal contradicts
            return isSameEvent(nodeA, otherNode); // Keep only if same event
          });
          
          if (updatedContradicts.length !== (nodeA.contradicts ?? []).length) {
            nodeA.contradicts = updatedContradicts.length > 0 ? updatedContradicts : undefined;
            nodeA.dirty = true;
          }
          
          // Ensure temporal nodes are not blocked
          if (nodeA.status === "blocked") {
            nodeA.status = "open";
            nodeA.dirty = true;
          }
        }
        continue; // Skip recency resolution for temporal nodes
      }
    }
    
    // Normal contradiction resolution for non-temporal or same-event temporal nodes
    let winner = candidates[0];
    for (const cid of candidates.slice(1)) {
      if (isNewer(state.raw[cid], state.raw[winner])) winner = cid;
    }
    candidates.forEach((cid) => {
      const ref = state.raw[cid];
      if (!ref) return;
      
      // TEMPORAL SHIELD: Don't block temporal nodes unless they refer to the same event
      if (isTemporalNode(ref)) {
        const isSameEventAsWinner = cid === winner || (state.raw[winner] && isSameEvent(ref, state.raw[winner]));
        if (!isSameEventAsWinner) {
          // Different events - keep open, just remove contradicts edge
          ref.status = ref.status ?? "open";
          ref.dirty = false;
          return;
        }
      }
      
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
