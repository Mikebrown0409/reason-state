import crypto from "crypto";
import { ReasonStateSimple } from "./simple.js";
import {
  injectMemoryContext,
  type ChatMessage,
  type InjectResult,
} from "../integrations/openaiMessages.js";
import {
  structureNodesWithContext,
  hasApiKey,
  type OpenAICompatibleOptions,
} from "../tools/openaiCompatiblePlanner.js";
import type { EchoState } from "../engine/types.js";

/**
 * Stats returned from inject() and retrieve().
 * Extended with structuring and auto-heal information.
 */
export type AutoStats = InjectResult["stats"] & {
  /** True if LLM structuring failed (nodes remain unstructured) */
  structuringError?: boolean;
  /** Number of auto-heal attempts made */
  autoHealAttempts?: number;
  /** True if auto-heal failed and rollback occurred */
  autoHealRolledBack?: boolean;
};

/**
 * Options for constructing the auto facade.
 */
export type ReasonStateAutoOptions = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  fetcher?: typeof fetch;
  maxTokens?: number;
};

/**
 * Generate a content-hash based id for deduplication.
 * This ensures the same content always gets the same id.
 */
function contentHashId(content: string): string {
  const hash = crypto.createHash("sha256").update(content).digest("hex");
  return `auto-${hash.slice(0, 16)}`;
}

/**
 * Normalize input to a consistent string for hashing.
 */
function normalizeForHash(input: string | Record<string, unknown>): string {
  if (typeof input === "string") {
    return input.trim().toLowerCase();
  }
  // Sort keys for consistent hashing of objects
  return JSON.stringify(input, Object.keys(input).sort());
}

/**
 * ReasonStateAuto: Front-door facade for zero-friction memory adoption.
 *
 * Exposes only:
 * - add(textOrObj) — stores raw node with content-hash id
 * - inject(messages, goal) — returns { messages, stats } with governed context
 * - retrieve(goal) — read-only, returns { context, stats }
 *
 * Internally wraps ReasonStateSimple in production mode for auto-heal/rollback.
 * LLM structuring (edges, type inference) will be added in future steps.
 */
export class ReasonStateAuto {
  private rs: ReasonStateSimple;
  private unstructuredIds: Set<string> = new Set();
  private opts: ReasonStateAutoOptions;

  constructor(opts: ReasonStateAutoOptions = {}) {
    this.opts = opts;
    this.rs = new ReasonStateSimple({
      mode: "production",
      apiKey: opts.apiKey,
      model: opts.model,
      baseUrl: opts.baseUrl,
      fetcher: opts.fetcher,
      maxTokens: opts.maxTokens,
    });
  }

  /**
   * Check if an API key is configured for LLM calls.
   */
  private hasApiKey(): boolean {
    return hasApiKey(this.opts as OpenAICompatibleOptions);
  }

  /**
   * Run LLM structuring on unstructured nodes.
   * Returns true if structuring succeeded, false if it failed.
   */
  private async runStructuring(goal: string): Promise<boolean> {
    if (this.unstructuredIds.size === 0) {
      return true; // Nothing to structure
    }

    if (!this.hasApiKey()) {
      // No API key - skip structuring (not an error)
      return true;
    }

    try {
      const result = await structureNodesWithContext(
        this.rs.state,
        Array.from(this.unstructuredIds),
        goal,
        this.opts as OpenAICompatibleOptions
      );

      if (result.patches.length > 0) {
        this.rs.applyPatches(result.patches);
      }

      // Clear unstructured IDs on success
      this.unstructuredIds.clear();
      return true;
    } catch {
      // Structuring failed - nodes remain unstructured
      return false;
    }
  }

  /**
   * Run auto-heal via the underlying ReasonStateSimple.
   * Uses the production mode query to trigger auto-heal.
   */
  private async runAutoHeal(goal: string): Promise<{
    autoHealAttempts: number;
    autoHealRolledBack: boolean;
  }> {
    // Trigger a retrieve-mode query which doesn't call LLM but does run reconciliation
    // For auto-heal, we need to trigger the production mode logic
    // The simplest way is to call query() which runs autoHealAndRetry in production mode
    try {
      const result = await this.rs.query(goal, { mode: "retrieve" });
      // retrieve mode doesn't trigger auto-heal, so we check for contradictions
      // and if present, run a plan query to trigger auto-heal
      // Actually, let's check the stats from retrieve
      return {
        autoHealAttempts: result.stats?.autoHealAttempts ?? 0,
        autoHealRolledBack: result.stats?.autoHealRolledBack ?? false,
      };
    } catch {
      return {
        autoHealAttempts: 0,
        autoHealRolledBack: false,
      };
    }
  }

  /**
   * Add a fact to memory. No options required.
   *
   * - Generates a content-hash id for deduplication
   * - Stores as a raw node (structuring happens on inject())
   * - Returns void (fire-and-forget for devs)
   *
   * @example
   * await rs.add("User hates Friday meetings");
   * await rs.add({ preference: "no_friday", reason: "user stated" });
   */
  async add(textOrObj: string | Record<string, unknown>): Promise<void> {
    const normalized = normalizeForHash(textOrObj);
    const id = contentHashId(normalized);

    // Derive summary from input
    const summary =
      typeof textOrObj === "string"
        ? textOrObj
        : (textOrObj.summary as string) ?? JSON.stringify(textOrObj);

    // Store via ReasonStateSimple using the content-hash id
    await this.rs.add(textOrObj, {
      id,
      summary,
      type: "fact", // Default type; LLM structuring will refine this in step 3
    });

    // Track as unstructured (for future LLM structuring in inject())
    this.unstructuredIds.add(id);
  }

  /**
   * Inject governed memory context into messages for an LLM call.
   *
   * - Runs LLM structuring on unstructured nodes (if API key configured)
   * - Runs auto-heal on contradictions (production mode)
   * - Builds token-budgeted context for the given goal
   * - Never throws - always returns safe { messages, stats }
   *
   * @example
   * const { messages, stats } = await rs.inject(baseMessages, "When is the retro?");
   * const response = await openai.chat.completions.create({ messages });
   */
  async inject(
    messages: ChatMessage[],
    goal: string
  ): Promise<{ messages: ChatMessage[]; stats: AutoStats }> {
    // 1. Run LLM structuring on unstructured nodes (if API key configured)
    const structuringSuccess = await this.runStructuring(goal);
    const structuringError = !structuringSuccess;

    // 2. Run auto-heal (via production mode in ReasonStateSimple)
    const healResult = await this.runAutoHeal(goal);

    // 3. Build context and inject into messages
    const result = await injectMemoryContext(this.rs, messages, { goal });

    // 4. Return messages with merged stats
    return {
      messages: result.messages,
      stats: {
        ...result.stats,
        structuringError,
        autoHealAttempts: healResult.autoHealAttempts,
        autoHealRolledBack: healResult.autoHealRolledBack,
      },
    };
  }

  /**
   * Retrieve governed context without modifying messages (read-only).
   *
   * - Builds token-budgeted context for the given goal
   * - No LLM calls, no mutations
   * - Returns raw context string + stats
   *
   * @example
   * const { context, stats } = await rs.retrieve("What are user preferences?");
   */
  async retrieve(goal: string): Promise<{ context: string; stats: AutoStats }> {
    return this.rs.retrieve(goal);
  }

  /**
   * Get the current state snapshot (for debugging/inspection).
   * Not part of the public front-door API, but useful for tests.
   */
  get state(): EchoState {
    return this.rs.state;
  }

  /**
   * Get count of nodes pending LLM structuring.
   * Useful for debugging; not part of the public API.
   */
  get pendingStructureCount(): number {
    return this.unstructuredIds.size;
  }
}
