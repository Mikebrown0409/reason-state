import type { EchoState, StateNode } from "../engine/types.js";

type BucketSelector = {
  label: string;
  nodeIds?: string[];
  nodeTypes?: StateNode["type"][];
  predicate?: (n: StateNode) => boolean;
  topK?: number;
};

type ContextMode = "deterministic" | "balanced" | "aggressive";

type ContextOptions = {
  maxChars?: number;
  includeTimeline?: boolean;
  timelineTail?: number;
  buckets?: BucketSelector[];
  mode?: ContextMode;
  goalId?: string;
  ranker?: (node: StateNode) => number; // optional custom ranker for aggressive mode
};

const DEFAULT_MAX_CHARS = 2500;
const DEFAULT_TIMELINE_TAIL = 5;

function formatNode(node: StateNode): string {
  const lineage =
    node.sourceType && node.sourceId ? ` (source: ${node.sourceType}/${node.sourceId})` : "";
  const status = node.status ? ` [${node.status}]` : "";
  return `- ${node.type}:${status} ${node.id}: ${node.summary ?? ""}${lineage}`.trim();
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

function collectDepsForGoal(state: EchoState, goalId?: string): Set<string> {
  if (!goalId) return new Set<string>();
  const seen = new Set<string>();
  const queue = [goalId];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    Object.values(state.raw ?? {}).forEach((n) => {
      if (!n) return;
      const deps = [
        ...(n.dependsOn ?? []),
        ...((n as any).temporalAfter ?? []),
        ...((n as any).temporalBefore ?? []),
      ];
      if (deps.includes(id)) queue.push(n.id);
    });
  }
  return seen;
}

function selectDeterministic(state: EchoState, buckets: BucketSelector[]): StateNode[] {
  const nodes = Object.values(state.raw ?? {});
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

function calcCap(total: number, remainingChars: number, headerLen: number, avgLineLen = 80): number {
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
    const cap = Math.min(
      section.maxCap ?? unique.length,
      Math.max(section.minCap ?? 0, calcCap(unique.length, remainingChars, 0))
    );

    let added = 0;
    for (const n of unique.slice(0, cap)) {
      const line = formatNode(n);
      const len = line.length + 1;
      if (used + len > maxChars) break;
      lines.push(line);
      used += len;
      added++;
    }

    const remaining = unique.length - added;
    if (remaining > 0) {
      const overflow = `- ... (${remaining} more ${section.title.toLowerCase()})`;
      maybeAdd(overflow);
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
  ranker?: (node: StateNode) => number
): { body: string; used: number } {
  const nodes = Object.values(state.raw ?? {});
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

  const remainingScore = nodes
    .filter((n) => !blockers.includes(n) && !goalChain.includes(n))
    .map((n) => {
      const base = typeWeight(n);
      const score = (ranker ? ranker(n) : 0) + base + recency(n) / 1e6;
      return { node: n, score };
    })
    .sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id))
    .map((s) => s.node);

  const sectionConfigs: SectionConfig[] = [
    { title: "Blockers", items: blockers, minCap: 5, maxCap: 50 },
    { title: "Goals/constraints", items: goalChain, minCap: 5, maxCap: 40 },
    { title: "Recent changes", items: recent, minCap: 5, maxCap: 20 },
    { title: "High-confidence", items: highConfidence, minCap: 3, maxCap: 15 },
    { title: "Assumptions", items: assumptions, minCap: 5, maxCap: 50 },
    { title: "Facts", items: facts, minCap: 5, maxCap: 50 },
    { title: "Actions/other", items: actions.concat(others), minCap: 5, maxCap: 30 },
    {
      title: "Additional",
      items: remainingScore,
      minCap: mode === "aggressive" ? 10 : 5,
      maxCap: mode === "aggressive" ? 80 : 40,
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
    const nodes = Object.values(state.raw ?? {});
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

  const { body, used } = buildBalancedSections(
    state,
    opts.goalId,
    maxChars,
    mode,
    mode === "aggressive" ? opts.ranker : undefined
  );
  return appendTimeline(body, state, includeTimeline, timelineTail, maxChars, used);
}

