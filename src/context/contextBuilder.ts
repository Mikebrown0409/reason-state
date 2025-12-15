import type { EchoState, StateNode } from "../engine/types.js";

type BucketSelector = {
  label: string;
  nodeIds?: string[];
  nodeTypes?: StateNode["type"][];
  predicate?: (n: StateNode) => boolean;
  topK?: number;
};

type ContextMode = "deterministic" | "balanced" | "aggressive";

import type { VectorStore } from "./vectorStore.js";

type ContextOptions = {
  maxChars?: number;
  includeTimeline?: boolean;
  timelineTail?: number;
  buckets?: BucketSelector[];
  mode?: ContextMode;
  goalId?: string;
  ranker?: (node: StateNode) => number; // optional custom ranker for aggressive mode
  vectorStore?: VectorStore;
  vectorTopK?: number;
  queryText?: string; // used for vector retrieval; defaults to none (no vector call)
};

const DEFAULT_MAX_CHARS = 2500;
const DEFAULT_TIMELINE_TAIL = 5;

function formatNode(node: StateNode): string {
  const lineage =
    node.sourceType && node.sourceId ? ` (source: ${node.sourceType}/${node.sourceId})` : "";
  const status = node.status ? ` [${node.status}]` : "";
  const isRetracted =
    (node.type === "assumption" && (node as any).assumptionStatus === "retracted") ||
    node.status === "blocked";
  const isArchived = node.status === "archived";
  // Important: we keep retracted/blocked/archived nodes in state (audit/replay),
  // but we should not leak stale summaries into the LLM context.
  const summary = isRetracted ? "(retracted)" : isArchived ? "(archived)" : (node.summary ?? "");
  return `- ${node.type}:${status} ${node.id}: ${summary}${lineage}`.trim();
}

/**
 * Filter out archived and retracted nodes from active context.
 * These nodes remain in state for audit/replay but should not be included
 * in context sent to the LLM.
 */
function isActiveNode(node: StateNode): boolean {
  // Exclude archived nodes
  if (node.status === "archived") return false;
  // Exclude retracted assumptions
  if (node.type === "assumption" && (node as any).assumptionStatus === "retracted") return false;
  return true;
}

function pick<T>(arr: T[], k?: number): T[] {
  if (k === undefined || k >= arr.length) return arr;
  return arr.slice(0, k);
}

function defaultBuckets(): BucketSelector[] {
  return [
    { label: "Goals/constraints", nodeTypes: ["planning"] },
    {
      label: "Blockers (unknown/dirty/invalid assumptions)",
      predicate: (n) =>
        n.type === "unknown" ||
        Boolean(n.dirty) ||
        (n.type === "assumption" && Boolean(n.assumptionStatus) && n.assumptionStatus !== "valid"),
    },
    { label: "Active plans", nodeTypes: ["planning"] },
    { label: "Facts", nodeTypes: ["fact"], topK: 50 },
    { label: "Assumptions", nodeTypes: ["assumption"], topK: 50 },
  ];
}

function recency(n: StateNode): number {
  const ts = (n as any).updatedAt ?? (n as any).createdAt;
  const t = ts ? Date.parse(ts) : 0;
  return Number.isNaN(t) ? 0 : t;
}

function typeWeight(n: StateNode): number {
  if (n.type === "unknown") return 5;
  if (n.type === "assumption") return 4;
  if (n.type === "planning") return 3;
  if (n.type === "fact") return 2;
  if (n.type === "action") return 1;
  return 0;
}

/**
 * Collect nodes related to a goal via bidirectional traversal.
 * - Upstream: what the goal depends on (dependsOn, temporalAfter, parent)
 * - Downstream: what depends on the goal
 * - Depth-limited to prevent explosion in large graphs
 */
function collectDepsForGoal(state: EchoState, goalId?: string, maxDepth = 3): Set<string> {
  if (!goalId) return new Set<string>();
  const goalNode = state.raw?.[goalId];
  if (!goalNode) return new Set<string>();

  const seen = new Set<string>();
  const depthMap = new Map<string, number>();

  // BFS with depth tracking
  const queue: Array<{ id: string; depth: number }> = [{ id: goalId, depth: 0 }];

  while (queue.length) {
    const { id, depth } = queue.shift()!;
    if (seen.has(id)) continue;
    if (depth > maxDepth) continue;

    seen.add(id);
    depthMap.set(id, depth);

    const node = state.raw?.[id];
    if (!node) continue;

    // Upstream: what this node depends on
    const upstream = [
      ...(node.dependsOn ?? []),
      ...((node as any).temporalAfter ?? []),
      ...(node.parentId ? [node.parentId] : []),
    ];
    for (const upId of upstream) {
      if (!seen.has(upId) && state.raw?.[upId]) {
        queue.push({ id: upId, depth: depth + 1 });
      }
    }

    // Downstream: what depends on this node
    Object.values(state.raw ?? {}).forEach((n) => {
      if (!n || seen.has(n.id)) return;
      const deps = [
        ...(n.dependsOn ?? []),
        ...((n as any).temporalAfter ?? []),
        ...((n as any).temporalBefore ?? []),
        ...(n.parentId === id ? [id] : []), // children
      ];
      if (deps.includes(id)) {
        queue.push({ id: n.id, depth: depth + 1 });
      }
    });

    // Also include direct children
    const children = node.children ?? [];
    for (const childId of children) {
      if (!seen.has(childId) && state.raw?.[childId]) {
        queue.push({ id: childId, depth: depth + 1 });
      }
    }
  }

  return seen;
}

/**
 * Score a node's relevance to the current goal.
 * Higher scores = more relevant to include in context.
 */
function goalRelevanceScore(
  n: StateNode,
  state: EchoState,
  goalId: string | undefined,
  depChain: Set<string>
): number {
  if (!goalId) return 0;

  const goalNode = state.raw?.[goalId];

  // Highest: in the dependency chain
  if (depChain.has(n.id)) return 100;

  // High: same parent as goal (sibling nodes)
  if (goalNode?.parentId && n.parentId === goalNode.parentId) return 80;

  // Medium-high: shares edges with goal chain nodes
  const nodeDeps = [
    ...(n.dependsOn ?? []),
    ...((n as any).temporalAfter ?? []),
    ...((n as any).temporalBefore ?? []),
  ];
  const sharedEdges = nodeDeps.filter((id) => depChain.has(id)).length;
  if (sharedEdges > 0) return 50 + Math.min(sharedEdges * 10, 30);

  // Medium: contradicts something in the goal chain (relevant for conflict resolution)
  const contradicts = n.contradicts ?? [];
  if (contradicts.some((id) => depChain.has(id))) return 40;

  // Low: no direct relationship
  return 0;
}

function selectDeterministic(state: EchoState, buckets: BucketSelector[]): StateNode[] {
  // Filter out archived and retracted nodes from active context
  const nodes = Object.values(state.raw ?? {}).filter(isActiveNode);
  const priority = (n: StateNode): number => {
    if (n.dirty) return 0;
    if (n.type === "assumption") return 1;
    if (n.type === "unknown") return 2;
    if (n.type === "fact") return 3;
    if (n.type === "planning") return 4;
    return 5;
  };

  const updatedAt = (n: StateNode): number => {
    const ts = (n as any).updatedAt ?? (n as any).createdAt;
    const t = ts ? Date.parse(ts) : 0;
    return Number.isNaN(t) ? 0 : t;
  };

  const select = (bucket: BucketSelector): StateNode[] => {
    let selected = nodes;
    if (bucket.nodeIds && bucket.nodeIds.length) {
      const ids = new Set(bucket.nodeIds);
      selected = selected.filter((n) => ids.has(n.id));
    }
    if (bucket.nodeTypes && bucket.nodeTypes.length) {
      const types = new Set(bucket.nodeTypes);
      selected = selected.filter((n) => types.has(n.type));
    }
    if (bucket.predicate) {
      selected = selected.filter(bucket.predicate);
    }
    return selected.sort((a, b) => {
      const pa = priority(a);
      const pb = priority(b);
      if (pa !== pb) return pa - pb;
      const ua = updatedAt(b) - updatedAt(a);
      if (ua !== 0) return ua;
      return a.id.localeCompare(b.id);
    });
  };

  const lines: StateNode[] = [];
  for (const bucket of buckets) {
    const items = select(bucket);
    const picked = bucket.topK ? items.slice(0, bucket.topK) : items;
    lines.push(...picked);
  }
  return lines;
}

type SectionConfig = {
  title: string;
  items: StateNode[];
  minCap?: number;
  maxCap?: number;
};

function sortByRecencyThenId(nodes: StateNode[]): StateNode[] {
  return [...nodes].sort((a, b) => {
    const rec = recency(b) - recency(a);
    if (rec !== 0) return rec;
    return a.id.localeCompare(b.id);
  });
}

function calcCap(
  total: number,
  remainingChars: number,
  headerLen: number,
  avgLineLen = 80
): number {
  if (remainingChars <= headerLen) return 0;
  const usable = remainingChars - headerLen;
  const estLines = Math.max(1, Math.floor(usable / avgLineLen));
  return Math.max(0, Math.min(total, estLines));
}

function formatBalancedSections(
  sections: SectionConfig[],
  maxChars: number
): { body: string; used: number } {
  const lines: string[] = [];
  let used = 0;
  const seen = new Set<string>();

  const maybeAdd = (text: string) => {
    const len = text.length + 1;
    if (used + len > maxChars) return false;
    lines.push(text);
    used += len;
    return true;
  };

  for (const section of sections) {
    const unique = section.items.filter((n) => !seen.has(n.id));
    if (!unique.length) continue;
    const header = `## ${section.title}`;
    if (!maybeAdd(header)) break;

    unique.forEach((n) => seen.add(n.id));

    const remainingChars = maxChars - used;
    let cap = Math.min(
      section.maxCap ?? unique.length,
      Math.max(section.minCap ?? 0, calcCap(unique.length, remainingChars, 0))
    );

    if (unique.length > cap) {
      const overflowLine = `- ... (${unique.length - cap} more ${section.title.toLowerCase()})`;
      while (cap > 0 && used + overflowLine.length + 1 > maxChars) {
        cap--;
      }
    }

    let added = 0;
    if (cap > 0) {
      for (const n of unique.slice(0, cap)) {
        const line = formatNode(n);
        const len = line.length + 1;
        if (used + len > maxChars) break;
        lines.push(line);
        used += len;
        added++;
      }
    }

    const remaining = unique.length - added;
    if (remaining > 0 || (added === 0 && unique.length > 0)) {
      const overflow = `- ... (${remaining > 0 ? remaining : unique.length} more ${section.title.toLowerCase()})`;
      if (!maybeAdd(overflow) && added > 0) {
        const last = lines.pop();
        if (last) {
          used -= last.length + 1;
          maybeAdd(overflow);
        }
      }
    }

    if (used >= maxChars) break;
  }

  return { body: lines.join("\n"), used };
}

function buildBalancedSections(
  state: EchoState,
  goalId: string | undefined,
  maxChars: number,
  mode: ContextMode,
  ranker?: (node: StateNode) => number,
  vectorHits?: Set<string>
): { body: string; used: number } {
  // Filter out archived and retracted nodes from active context
  const nodes = Object.values(state.raw ?? {}).filter(isActiveNode);
  const sorted = sortByRecencyThenId(nodes);
  const depChain = collectDepsForGoal(state, goalId);
  const blockers = sorted.filter(
    (n) =>
      n.type === "unknown" ||
      Boolean(n.dirty) ||
      (n.type === "assumption" && Boolean(n.assumptionStatus) && n.assumptionStatus !== "valid")
  );
  const goalChain = sorted.filter(
    (n) => n.type === "planning" || depChain.has(n.id) || (goalId ? n.id === goalId : false)
  );
  const recent = sorted.slice(0, 20);
  const highConfidence = sorted.filter(
    (n) => (n as any).details?.confidence && (n as any).details.confidence > 0.7
  );
  const assumptions = sorted.filter((n) => n.type === "assumption");
  const facts = sorted.filter((n) => n.type === "fact");
  const actions = sorted.filter((n) => n.type === "action");
  const others = sorted.filter(
    (n) => n.type !== "assumption" && n.type !== "fact" && n.type !== "action"
  );

  // Score remaining nodes by goal relevance + type + recency
  const remainingScore = nodes
    .filter((n) => !blockers.includes(n) && !goalChain.includes(n))
    .map((n) => {
      const base = typeWeight(n);
      const goalScore = goalRelevanceScore(n, state, goalId, depChain);
      const customRank = ranker ? ranker(n) : 0;
      // Goal relevance is weighted heavily to prioritize workflow-relevant nodes
      const score = goalScore * 2 + customRank + base + recency(n) / 1e12;
      return { node: n, score };
    })
    .sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id))
    .map((s) => s.node);

  const vectorMatches =
    vectorHits && vectorHits.size > 0 ? sorted.filter((n) => vectorHits.has(n.id)) : [];

  // Tighter caps to enforce ~20-30 nodes in context for large graphs
  // Deduplication in formatBalancedSections further reduces actual count
  // minCaps ensure critical items appear even in tight budgets
  const sectionConfigs: SectionConfig[] = [
    vectorMatches.length
      ? { title: "Vector matches", items: vectorMatches, minCap: 3, maxCap: 10 }
      : { title: "", items: [] },
    { title: "Blockers", items: blockers, minCap: 3, maxCap: 10 },
    { title: "Goals/constraints", items: goalChain, minCap: 3, maxCap: 15 },
    { title: "Recent changes", items: recent, minCap: 5, maxCap: 12 },
    { title: "High-confidence", items: highConfidence, minCap: 2, maxCap: 5 },
    { title: "Assumptions", items: assumptions, minCap: 3, maxCap: 10 },
    { title: "Facts", items: facts, minCap: 3, maxCap: 15 },
    { title: "Actions/other", items: actions.concat(others), minCap: 2, maxCap: 10 },
    {
      title: "Additional",
      items: remainingScore,
      minCap: mode === "aggressive" ? 5 : 2,
      maxCap: mode === "aggressive" ? 15 : 8,
    },
  ];

  return formatBalancedSections(sectionConfigs, maxChars);
}

function appendTimeline(
  body: string,
  state: EchoState,
  includeTimeline: boolean,
  timelineTail: number,
  maxChars: number,
  usedOverride?: number
): string {
  const lines: string[] = [body];
  let used = usedOverride ?? body.length;
  if (includeTimeline && (state.history?.length ?? 0) > 0) {
    const section = "## Timeline";
    if (used + section.length + 1 <= maxChars) {
      lines.push(section);
      used += section.length + 1;
      const tail = state.history.slice(-timelineTail);
      tail.forEach((p, idx) => {
        const line = `- ${idx}: ${p.op} ${p.path}${p.reason ? ` (${p.reason})` : ""}`;
        if (used + line.length + 1 <= maxChars) {
          lines.push(line);
          used += line.length + 1;
        }
      });
    }
  }
  const context = lines.join("\n");
  return context.length > maxChars ? context.slice(0, maxChars) : context;
}

export function buildContext(state: EchoState, opts: ContextOptions = {}): string {
  const mode: ContextMode = opts.mode ?? "balanced";
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const includeTimeline = opts.includeTimeline ?? true;
  const timelineTail = opts.timelineTail ?? DEFAULT_TIMELINE_TAIL;
  const buckets = opts.buckets ?? defaultBuckets();

  if (mode === "deterministic") {
    const lines: string[] = [];
    let used = 0;
    // Filter out archived and retracted nodes from active context
    const nodes = Object.values(state.raw ?? {}).filter(isActiveNode);
    const priority = (n: StateNode): number => {
      if (n.dirty) return 0;
      if (n.type === "assumption") return 1;
      if (n.type === "unknown") return 2;
      if (n.type === "fact") return 3;
      if (n.type === "planning") return 4;
      return 5;
    };
    const updatedAt = (n: StateNode): number => {
      const ts = (n as any).updatedAt ?? (n as any).createdAt;
      const t = ts ? Date.parse(ts) : 0;
      return Number.isNaN(t) ? 0 : t;
    };
    const select = (bucket: BucketSelector): StateNode[] => {
      let selected = nodes;
      if (bucket.nodeIds && bucket.nodeIds.length) {
        const ids = new Set(bucket.nodeIds);
        selected = selected.filter((n) => ids.has(n.id));
      }
      if (bucket.nodeTypes && bucket.nodeTypes.length) {
        const types = new Set(bucket.nodeTypes);
        selected = selected.filter((n) => types.has(n.type));
      }
      if (bucket.predicate) {
        selected = selected.filter(bucket.predicate);
      }
      return selected
        .sort((a, b) => {
          const pa = priority(a);
          const pb = priority(b);
          if (pa !== pb) return pa - pb;
          const ua = updatedAt(b) - updatedAt(a);
          if (ua !== 0) return ua;
          return a.id.localeCompare(b.id);
        })
        .slice(0, bucket.topK ?? selected.length);
    };
    for (const bucket of buckets) {
      const items = select(bucket);
      if (!items.length) continue;
      const header = `## ${bucket.label}`;
      const headerLen = header.length + 1;
      if (used + headerLen > maxChars) break;
      lines.push(header);
      used += headerLen;
      for (const n of items) {
        const line = formatNode(n);
        const len = line.length + 1;
        if (used + len > maxChars) break;
        lines.push(line);
        used += len;
      }
    }
    const body = lines.join("\n");
    return appendTimeline(body, state, includeTimeline, timelineTail, maxChars);
  }

  let vectorHitSet: Set<string> | undefined;
  if (opts.vectorStore && opts.queryText) {
    try {
      const hits = opts.vectorStore.query(opts.queryText, opts.vectorTopK ?? 20);
      vectorHitSet = new Set(hits.map((h) => h.id));
    } catch {
      vectorHitSet = undefined; // swallow errors to keep default path deterministic
    }
  }

  const { body, used } = buildBalancedSections(
    state,
    opts.goalId,
    maxChars,
    mode,
    mode === "aggressive" ? opts.ranker : undefined,
    vectorHitSet
  );
  return appendTimeline(body, state, includeTimeline, timelineTail, maxChars, used);
}
