import { ReasonState } from "../engine/ReasonState.js";
import { buildContext } from "../context/contextBuilder.js";
import { openaiCompatiblePlanWithContext } from "../tools/openaiCompatiblePlanner.js";
import type { EchoState, Patch } from "../engine/types.js";

type SimpleOptions = {
  model?: string;
  apiKey?: string;
  baseUrl?: string;
  maxTokens?: number; // Approximate char budget: maxTokens * 4
};

type AddOptions = {
  type?: "fact" | "assumption" | "action" | "planning";
  summary?: string;
  id?: string;
  confidence?: number;
};

type UpdateOptions = {
  retracted?: boolean;
  summary?: string;
  reason?: string;
};

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
    const id = opts.id ?? `node-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const summary =
      opts.summary ??
      (typeof textOrObj === "string" ? textOrObj : (textOrObj as any).summary ?? JSON.stringify(textOrObj));
    const patch: Patch = {
      op: "add",
      path: `/raw/${id}`,
      value: {
        id,
        type: opts.type ?? "fact",
        summary,
        details: typeof textOrObj === "string" ? { text: textOrObj } : textOrObj,
        confidence: opts.confidence,
      },
    };
    this.engine.applyPatches([patch]);
    return this.engine.snapshot;
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
    };
    const patch: Patch = { op: current ? "replace" : "add", path: `/raw/${id}`, value: next };
    this.engine.applyPatches([patch]);
    return this.engine.snapshot;
  }

  /**
   * Query with a provider-neutral planner (OpenAI-compatible; works with Groq, OpenAI, Anthropic via base/model).
   */
  async query(goal: string): Promise<{ patches: Patch[]; state: EchoState }> {
    const maxChars = (this.opts.maxTokens ?? 1000) * 4;
    const ctx = buildContext(this.engine.snapshot, { mode: "balanced", maxChars });
    const res = await openaiCompatiblePlanWithContext(
      this.engine.snapshot,
      goal,
      {
        model: this.opts.model ?? "gpt-4o-mini",
        apiKey: this.opts.apiKey,
        baseUrl: this.opts.baseUrl,
      }
    );
    if (res.patches?.length) {
      this.engine.applyPatches(res.patches);
    }
    return { patches: res.patches, state: this.engine.snapshot };
  }

  get state(): EchoState {
    return this.engine.snapshot;
  }
}

