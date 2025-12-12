import { ReasonState } from "../engine/ReasonState.js";
import { buildContext } from "../context/contextBuilder.js";
import { openaiCompatiblePlanWithContext } from "../tools/openaiCompatiblePlanner.js";
import type { EchoState, Patch } from "../engine/types.js";
import { buildRollbackPatches } from "../engine/reconciliation.js";

type SimpleOptions = {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number; // Approximate char budget: maxTokens * 4
  fetcher?: typeof fetch;
  vectorStore?: any;
  vectorTopK?: number;
};

type AddOptions = {
  type?: "fact" | "assumption" | "action" | "planning";
  summary?: string;
  id?: string;
  /**
   * Stable external key. If provided (and no explicit id), we derive a deterministic node id from it.
   * Recommended format examples:
   * - "user:pref:meeting_day"
   * - "tool:searchFlights#123"
   */
  key?: string;
  /**
   * Lineage fields. If provided (and no explicit id), we derive a deterministic node id from them.
   */
  sourceType?: string;
  sourceId?: string;
  confidence?: number;
};

type UpdateOptions = {
  retracted?: boolean;
  summary?: string;
  reason?: string;
};

type QueryMode = "plan" | "retrieve";

function stableIdFromKey(key: string): string {
  // Important: id is used inside JSON pointer paths like `/raw/${id}` so it must not contain `/`.
  return `k-${encodeURIComponent(key)}`;
}

function stableIdFromSource(sourceType: string, sourceId: string): string {
  return `src-${encodeURIComponent(sourceType)}-${encodeURIComponent(sourceId)}`;
}

export class ReasonStateSimple {
  private engine: ReasonState;
  private opts: SimpleOptions;

  constructor(opts: SimpleOptions = {}) {
    this.engine = new ReasonState();
    this.opts = opts;
  }

  /**
   * Add a fact/assumption/action/planning node from text or object.
   */
  async add(textOrObj: string | Record<string, unknown>, opts: AddOptions = {}): Promise<EchoState> {
    const id =
      opts.id ??
      (opts.key ? stableIdFromKey(opts.key) : undefined) ??
      (opts.sourceType && opts.sourceId ? stableIdFromSource(opts.sourceType, opts.sourceId) : undefined) ??
      `node-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const summary =
      opts.summary ??
      (typeof textOrObj === "string" ? textOrObj : (textOrObj as any).summary ?? JSON.stringify(textOrObj));
    const existing = this.engine.snapshot.raw[id];
    const patch: Patch = {
      op: existing ? "replace" : "add",
      path: `/raw/${id}`,
      value: {
        id,
        type: opts.type ?? "fact",
        summary,
        details: typeof textOrObj === "string" ? { text: textOrObj } : textOrObj,
        sourceType: opts.sourceType ?? (opts.key ? "key" : undefined),
        sourceId: opts.sourceId ?? opts.key,
      },
    };
    this.engine.applyPatches([patch]);
    return this.engine.snapshot;
  }

  /**
   * Put (upsert) a node by a stable key.
   * Convenience alias for `add(..., { key })`.
   */
  async put(
    key: string,
    textOrObj: string | Record<string, unknown>,
    opts: Omit<AddOptions, "id" | "key"> = {}
  ): Promise<{ id: string; state: EchoState }> {
    const id = stableIdFromKey(key);
    await this.add(textOrObj, { ...opts, id, key, sourceType: opts.sourceType ?? "key", sourceId: opts.sourceId ?? key });
    return { id, state: this.engine.snapshot };
  }

  /**
   * Update or retract by id.
   */
  async update(id: string, opts: UpdateOptions = {}): Promise<EchoState> {
    const current = this.engine.snapshot.raw[id] ?? { id, type: "fact" };
    const next = {
      ...current,
      summary: opts.summary ?? current.summary,
      details: { ...(current as any).details, reason: opts.reason },
      assumptionStatus: opts.retracted ? "retracted" : (current as any).assumptionStatus,
      status: opts.retracted ? "blocked" : current.status,
      dirty: opts.retracted ? true : (current as any).dirty,
    };
    const patch: Patch = { op: current ? "replace" : "add", path: `/raw/${id}`, value: next };
    this.engine.applyPatches([patch]);
    return this.engine.snapshot;
  }

  /**
   * Update/retract by stable key (no need to manage ids).
   */
  async updateKey(key: string, opts: UpdateOptions = {}): Promise<EchoState> {
    const id = stableIdFromKey(key);
    return this.update(id, opts);
  }

  /**
   * Retract by stable key (works for any node type; marks blocked + dirty).
   * Optionally run self-heal after the retraction.
   */
  async retractKey(
    key: string,
    opts: { heal?: boolean; fromCheckpoint?: string; reason?: string } = {}
  ): Promise<EchoState> {
    await this.updateKey(key, { retracted: true, reason: opts.reason ?? "retractedByKey" });
    if (opts.heal) {
      await this.engine.selfHealAndReplay(opts.fromCheckpoint);
    }
    return this.engine.snapshot;
  }

  /**
   * Retract by id explicitly (useful if you stored internal ids).
   */
  async retractId(
    id: string,
    opts: { heal?: boolean; fromCheckpoint?: string; reason?: string } = {}
  ): Promise<EchoState> {
    return this.retract(id, { ...opts, by: "id" });
  }

  /**
   * Query with a provider-neutral planner (OpenAI-compatible; works with Groq, OpenAI, Anthropic via base/model).
   */
  async query(
    goal: string,
    opts: { mode?: QueryMode } = {}
  ): Promise<{ patches: Patch[]; state: EchoState; context?: string }> {
    const maxChars = (this.opts.maxTokens ?? 1000) * 4;
    const ctx = buildContext(this.engine.snapshot, {
      mode: "balanced",
      maxChars,
      vectorStore: this.opts.vectorStore,
      vectorTopK: this.opts.vectorTopK,
      queryText: goal,
    });

    if (opts.mode === "retrieve") {
      return { patches: [], state: this.engine.snapshot, context: ctx };
    }

    const res = await openaiCompatiblePlanWithContext(
      this.engine.snapshot,
      goal,
      {
        model: this.opts.model ?? "gpt-4o-mini",
        apiKey: this.opts.apiKey,
        baseUrl: this.opts.baseUrl,
        fetcher: this.opts.fetcher,
      }
    );
    if (res.patches?.length) {
      this.engine.applyPatches(res.patches);
    }
    return { patches: res.patches, state: this.engine.snapshot, context: ctx };
  }

  /**
   * Convenience wrapper for the common "memory layer" use case:
   * build governed context without calling an LLM.
   */
  async retrieveContext(goal: string): Promise<string> {
    const res = await this.retrieve(goal);
    return res.context;
  }

  /**
   * Retrieve governed context + lightweight stats (no LLM).
   * This keeps the happy path "context-only" while still letting devs surface ROI metrics easily.
   */
  async retrieve(
    goal: string
  ): Promise<{
    context: string;
    stats: {
      contextChars: number;
      estTokens: number;
      rawNodeCount: number;
      summaryNodeCount: number;
      unknownCount: number;
      dirtyCount: number;
      blockedCount: number;
    };
  }> {
    const res = await this.query(goal, { mode: "retrieve" });
    const context = res.context ?? "";
    const state = res.state;
    const rawNodes = Object.values(state.raw ?? {});
    const blockedCount = rawNodes.filter((n: any) => n?.status === "blocked").length;
    const dirtyCount = rawNodes.filter((n: any) => n?.dirty).length;
    return {
      context,
      stats: {
        contextChars: context.length,
        estTokens: Math.ceil(context.length / 4),
        rawNodeCount: Object.keys(state.raw ?? {}).length,
        summaryNodeCount: Object.keys(state.summary ?? {}).length,
        unknownCount: state.unknowns?.length ?? 0,
        dirtyCount,
        blockedCount,
      },
    };
  }

  /**
   * Convenience wrapper for planning:
   * build governed context, call your model, and apply returned patches.
   */
  async plan(goal: string): Promise<{ patches: Patch[]; state: EchoState; context?: string }> {
    return this.query(goal);
  }

  get state(): EchoState {
    return this.engine.snapshot;
  }

  /**
   * Explicitly retract a node (no hidden recompute).
   * - If you pass `{ by: "key" }`, `idOrKey` is treated as a stable key.
   * - Assumptions use engine-level retraction; other node types are marked blocked + dirty.
   * Optionally run self-heal after retraction.
   */
  async retract(
    idOrKey: string,
    opts: { by?: "id" | "key"; heal?: boolean; fromCheckpoint?: string; reason?: string } = {}
  ): Promise<EchoState> {
    // Default behavior: accept either an existing internal id OR a stable key (no flags needed).
    // Priority:
    // 1) treat as id if it exists
    // 2) treat as key if derived id exists
    // 3) if `by` is explicitly provided, honor it
    let id = idOrKey;
    if (opts.by === "key") {
      id = stableIdFromKey(idOrKey);
    } else if (opts.by === "id") {
      id = idOrKey;
    } else {
      if (!this.engine.snapshot.raw?.[idOrKey]) {
        const keyId = stableIdFromKey(idOrKey);
        if (this.engine.snapshot.raw?.[keyId]) {
          id = keyId;
        }
      }
    }
    const node = this.engine.snapshot.raw?.[id];
    if (node?.type === "assumption") {
      this.engine.retractAssumption(id);
    } else {
      // If we can't find the node, treat as a no-op (safe default for memory layer usage).
      if (!node) return this.engine.snapshot;
      await this.update(id, { retracted: true, reason: opts.reason ?? "retract" });
    }
    if (opts.heal) {
      await this.engine.selfHealAndReplay(opts.fromCheckpoint);
    }
    return this.engine.snapshot;
  }

  /**
   * Explicitly run self-heal + replay (no hidden triggers).
   */
  async heal(opts: { fromCheckpoint?: string } = {}): Promise<EchoState> {
    await this.engine.selfHealAndReplay(opts.fromCheckpoint);
    return this.engine.snapshot;
  }

  /**
   * Roll back a subtree by id (local patching), optionally followed by heal.
   */
  async rollback(
    nodeId: string,
    opts: { heal?: boolean; fromCheckpoint?: string } = {}
  ): Promise<EchoState> {
    const patches = buildRollbackPatches(this.engine.snapshot, nodeId);
    if (patches.length > 0) {
      this.engine.applyPatches(patches);
    }
    if (opts.heal) {
      await this.engine.selfHealAndReplay(opts.fromCheckpoint);
    }
    return this.engine.snapshot;
  }
}

