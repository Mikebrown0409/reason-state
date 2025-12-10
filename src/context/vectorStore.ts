export type VectorHit = { id: string; score?: number };

// Minimal synchronous vector store contract for buildContext.
export interface VectorStore {
  query: (text: string, topK?: number) => VectorHit[];
  upsert?: (items: { id: string; text: string }[]) => void;
  clear?: () => void;
}

// Tiny in-memory store using bag-of-words cosine similarity (no heavy deps).
export class InMemoryVectorStore implements VectorStore {
  private readonly docs = new Map<string, Map<string, number>>();

  upsert(items: { id: string; text: string }[]) {
    for (const { id, text } of items) {
      this.docs.set(id, this.vectorize(text));
    }
  }

  query(text: string, topK = 20): VectorHit[] {
    const qVec = this.vectorize(text);
    const scored: VectorHit[] = [];
    for (const [id, vec] of this.docs.entries()) {
      const score = this.cosine(qVec, vec);
      scored.push({ id, score });
    }
    return scored
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.id.localeCompare(b.id))
      .slice(0, topK);
  }

  clear() {
    this.docs.clear();
  }

  private vectorize(text: string): Map<string, number> {
    const counts = new Map<string, number>();
    const tokens = text
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter(Boolean);
    for (const t of tokens) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return counts;
  }

  private cosine(a: Map<string, number>, b: Map<string, number>): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (const [, v] of a) normA += v * v;
    for (const [, v] of b) normB += v * v;
    const keys = new Set([...a.keys(), ...b.keys()]);
    for (const k of keys) {
      dot += (a.get(k) ?? 0) * (b.get(k) ?? 0);
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / Math.sqrt(normA * normB);
  }
}

