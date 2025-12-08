import type { EchoState, StateNode } from "../engine/types.js";

type BucketSelector = {
  label: string;
  nodeIds?: string[];
  nodeTypes?: StateNode["type"][];
  predicate?: (n: StateNode) => boolean;
  topK?: number;
};

type ContextOptions = {
  maxChars?: number;
  includeTimeline?: boolean;
  timelineTail?: number;
  buckets?: BucketSelector[];
};

const DEFAULT_MAX_CHARS = 4000;
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
    { label: "Facts", nodeTypes: ["fact"], topK: 8 },
    { label: "Assumptions", nodeTypes: ["assumption"], topK: 8 },
  ];
}

export function buildContext(state: EchoState, opts: ContextOptions = {}): string {
  const maxChars = opts.maxChars ?? DEFAULT_MAX_CHARS;
  const includeTimeline = opts.includeTimeline ?? true;
  const timelineTail = opts.timelineTail ?? DEFAULT_TIMELINE_TAIL;
  const buckets = opts.buckets ?? defaultBuckets();

  const nodes = Object.values(state.raw ?? {});
  const lines: string[] = [];

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

  for (const bucket of buckets) {
    const items = pick(select(bucket), bucket.topK);
    if (!items.length) continue;
    lines.push(`## ${bucket.label}`);
    items.forEach((n) => lines.push(formatNode(n)));
  }

  if (includeTimeline && (state.history?.length ?? 0) > 0) {
    lines.push("## Timeline");
    const tail = state.history.slice(-timelineTail);
    tail.forEach((p, idx) => {
      lines.push(`- ${idx}: ${p.op} ${p.path}${p.reason ? ` (${p.reason})` : ""}`);
    });
  }

  const context = lines.join("\n");
  return context.length > maxChars ? context.slice(0, maxChars) : context;
}
