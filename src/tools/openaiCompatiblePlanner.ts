import { buildContext } from "../context/contextBuilder.js";
import type { EchoState, Patch, NodeType } from "../engine/types.js";
import { SYSTEM_PROMPT, validateModelPatches } from "./grokChat.js";

export type OpenAICompatiblePlanResult = {
  patches: Patch[];
  attempts: number;
  lastError?: string;
  raw?: string;
};

export type StructureNodesResult = {
  patches: Patch[];
  attempts: number;
  lastError?: string;
  raw?: string;
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type OpenAICompatibleOptions = {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  headers?: Record<string, string>;
  fetcher?: Fetcher; // optional for testing/custom fetch
  maxTokens?: number;
};

const DEFAULT_BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_MAX_TOKENS = 256;

function resolveApiKey(opts: OpenAICompatibleOptions): string {
  const key =
    opts.apiKey ??
    (globalThis as any)?.process?.env?.OPENAI_API_KEY ??
    (globalThis as any)?.process?.env?.VITE_OPENAI_API_KEY ??
    (typeof import.meta !== "undefined"
      ? (import.meta as any)?.env?.VITE_OPENAI_API_KEY
      : undefined);
  if (!key || key.trim().length === 0) {
    throw new Error(
      "OPENAI_API_KEY (or VITE_OPENAI_API_KEY) is required for openaiCompatiblePlanner"
    );
  }
  return key;
}

async function fetchChat(
  messages: Array<{ role: string; content: string }>,
  opts: OpenAICompatibleOptions
): Promise<string> {
  const apiKey = resolveApiKey(opts);
  const base =
    opts.baseUrl ??
    (globalThis as any)?.process?.env?.OPENAI_BASE_URL ??
    (globalThis as any)?.process?.env?.VITE_OPENAI_BASE_URL ??
    DEFAULT_BASE;
  const model = opts.model ?? DEFAULT_MODEL;
  const max_tokens = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const fetcher = opts.fetcher ?? fetch;
  const res = await fetcher(`${base.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
    body: JSON.stringify({ model, messages, max_tokens }),
  });
  if (!res.ok) throw new Error(`openaiCompatiblePlanner error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("openaiCompatiblePlanner returned empty content");
  return content;
}

/**
 * Generic OpenAI-compatible planner adapter.
 * Works with OpenAI and any provider exposing a chat/completions-compatible API (e.g., Groq, Together, Fireworks).
 */
export async function openaiCompatiblePlanWithContext(
  state: EchoState,
  userGoal: string,
  opts: OpenAICompatibleOptions = {}
): Promise<OpenAICompatiblePlanResult> {
  const context = buildContext(state);
  const baseMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Goal: ${userGoal}\nContext:\n${context}` },
  ];

  const knownIds = new Set<string>([
    ...Object.keys(state.raw ?? {}),
    ...Object.keys(state.summary ?? {}),
  ]);

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages =
      attempt === 0
        ? baseMessages
        : [
            ...baseMessages,
            {
              role: "user",
              content: `Previous output invalid: ${lastError}. Return ONLY a JSON array of patches following the rules.`,
            },
          ];
    const content = await fetchChat(messages, opts);
    try {
      const patches = validateModelPatches(content, new Set<string>(knownIds));
      return { patches, attempts: attempt + 1, raw: content };
    } catch (err) {
      lastError = String(err);
      if (attempt === 1) {
        throw new Error(`openaiCompatiblePlanWithContext validation failed: ${lastError}`);
      }
    }
  }
  throw new Error("openaiCompatiblePlanWithContext unreachable");
}

/**
 * System prompt for structuring unstructured nodes.
 * Unlike reconciliation (summary-only), structuring can modify node types and edges.
 */
const STRUCTURE_SYSTEM_PROMPT = [
  "You are Reason-State structuring. Given new unstructured nodes, classify and connect them to existing memory.",
  "",
  "Rules (must follow exactly):",
  "- For each unstructured node listed, emit patches to classify and connect it.",
  "- Allowed patches:",
  "  1. Set type: {\"op\":\"replace\",\"path\":\"/raw/{id}/type\",\"value\":\"fact|assumption|unknown|planning\"}",
  "  2. Add contradicts edge: {\"op\":\"replace\",\"path\":\"/raw/{id}/contradicts\",\"value\":[\"other-id\"]}",
  "  3. Add dependsOn edge: {\"op\":\"replace\",\"path\":\"/raw/{id}/dependsOn\",\"value\":[\"other-id\"]}",
  "  4. Add temporal edge: {\"op\":\"replace\",\"path\":\"/raw/{id}/temporalAfter\",\"value\":[\"other-id\"]}",
  "  5. Update summary: {\"op\":\"replace\",\"path\":\"/summary/{id}\",\"value\":\"concise summary\"}",
  "  6. Archive node: {\"op\":\"replace\",\"path\":\"/raw/{id}/status\",\"value\":\"archived\"}",
  "  7. Reactivate node: {\"op\":\"replace\",\"path\":\"/raw/{id}/status\",\"value\":\"open\"}",
  "",
  "- Type classification guidelines:",
  "  - fact: verified information from tools or user statements",
  "  - assumption: inferred or uncertain information that may change",
  "  - unknown: missing information needed to proceed",
  "  - planning: goals, tasks, or action items",
  "",
  "CRITICAL - Create semantic connections (edges):",
  "You MUST create edges to connect related nodes. This is essential for memory retrieval.",
  "",
  "- dependsOn edges: Create when nodes share:",
  "  * Same person, place, topic, or entity",
  "  * Related concepts (e.g., 'user's budget' dependsOn 'user's travel plans')",
  "  * Question-answer relationships",
  "  * Cause-effect relationships",
  "  * Part-whole relationships",
  "  Example: If node A mentions 'user's travel to Paris' and node B mentions 'user's hotel in Paris',",
  "  create: {\"op\":\"replace\",\"path\":\"/raw/{B-id}/dependsOn\",\"value\":[\"{A-id}\"]}",
  "",
  "- temporalAfter edges: Create when nodes have chronological relationships:",
  "  * Sequential events (earlier event → later event)",
  "  * Session dates or timestamps (earlier session → later session)",
  "  * Ordered steps in a process",
  "  Example: If node A is 'Session date: 1 May 2023' and node B is 'Session date: 2 May 2023',",
  "  create: {\"op\":\"replace\",\"path\":\"/raw/{B-id}/temporalAfter\",\"value\":[\"{A-id}\"]}",
  "",
  "- contradicts edges: Create when nodes contain conflicting information:",
  "  * Direct contradictions (e.g., 'user wants X' vs 'user wants Y' for same context)",
  "  * Mutually exclusive statements",
  "  Example: If node A says 'user prefers option A' and node B says 'user prefers option B' for the same choice,",
  "  create: {\"op\":\"replace\",\"path\":\"/raw/{A-id}/contradicts\",\"value\":[\"{B-id}\"]}",
  "  and: {\"op\":\"replace\",\"path\":\"/raw/{B-id}/contradicts\",\"value\":[\"{A-id}\"]}",
  "",
  "  CRITICAL - Temporal nodes (dates/timestamps) are NOT contradictions:",
  "  * Two nodes with different dates (e.g., '7 May 2023' vs '8 May 2023') are NOT contradictions",
  "  * They are distinct points on a timeline - use temporalAfter/temporalBefore edges instead",
  "  * Only create contradicts edges for temporal nodes if they refer to the EXACT SAME event/instance",
  "  * Example: 'Session date: 7 May 2023' and 'Session date: 8 May 2023' should use temporalAfter, NOT contradicts",
  "",
  "- Create edges liberally: It's better to have more connections than fewer.",
  "  When in doubt, create a dependsOn edge if nodes are related in any way.",
  "",
  "- Detect contradictions: if a new node contradicts an existing node, add both to each other's contradicts array.",
  "",
  "- Archival and reactivation (IMPORTANT):",
  "  - If a new node supersedes or contradicts an existing active node, ARCHIVE the old node.",
  "  - Example: 'User wants Tokyo' superseded by 'User wants Amsterdam' → archive the Tokyo node.",
  "  - To archive: {\"op\":\"replace\",\"path\":\"/raw/{old-id}/status\",\"value\":\"archived\"}",
  "  - If a new node matches content of an archived node (user reverted context),",
  "    REACTIVATE the archived node and ARCHIVE the currently active conflicting node.",
  "  - To reactivate: {\"op\":\"replace\",\"path\":\"/raw/{archived-id}/status\",\"value\":\"open\"}",
  "  - Archived nodes are NOT deleted; they remain for audit and can be reactivated.",
  "",
  "- Use existing node ids; do NOT invent new ids.",
  "- Output a JSON array of patches. If unsure or no changes needed, return [].",
  "",
  "Example output (note: includes edges):",
  '[{"op":"replace","path":"/raw/auto-abc123/type","value":"fact"},{"op":"replace","path":"/raw/auto-abc123/dependsOn","value":["auto-xyz789"]},{"op":"replace","path":"/raw/auto-def456/temporalAfter","value":["auto-abc123"]},{"op":"replace","path":"/raw/auto-ghi789/status","value":"archived"}]',
].join("\n");

/**
 * Parsed field-level update from LLM.
 */
type FieldUpdate = {
  nodeId: string;
  field: string;
  value: unknown;
};

/**
 * Validate and parse structuring patches from LLM output.
 * Converts field-level patches into validated FieldUpdates.
 * Summary patches are returned directly.
 */
function validateStructuringPatches(
  content: string,
  allowedNodeIds: Set<string>,
  allKnownIds: Set<string>
): { fieldUpdates: FieldUpdate[]; summaryPatches: Patch[] } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(`structuring output is not valid JSON: ${String(err)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("structuring output must be a JSON array of patches");
  }

  const ALLOWED_OPS = new Set(["add", "replace"]);
  const ALLOWED_NODE_FIELDS = new Set(["type", "contradicts", "dependsOn", "temporalAfter", "temporalBefore", "status"]);
  const VALID_TYPES: Set<NodeType> = new Set(["fact", "assumption", "unknown", "planning", "action"]);
  const VALID_STATUSES = new Set(["open", "blocked", "resolved", "dirty", "archived"]);

  const fieldUpdates: FieldUpdate[] = [];
  const summaryPatches: Patch[] = [];

  for (const p of parsed) {
    if (!p || typeof p !== "object") throw new Error("patch must be an object");
    const { op, path, value } = p as Patch;
    if (!ALLOWED_OPS.has(op as string)) {
      throw new Error(`invalid op: ${String(op)}`);
    }
    if (typeof path !== "string") throw new Error("path must be string");

    // Parse path: /raw/{id}/{field} or /summary/{id}
    const rawFieldMatch = path.match(/^\/raw\/([^/]+)\/([^/]+)$/);
    const rawMatch = path.match(/^\/raw\/([^/]+)$/);
    const summaryMatch = path.match(/^\/summary\/([^/]+)$/);

    if (rawFieldMatch) {
      // /raw/{id}/{field} - updating a specific field
      const [, id, field] = rawFieldMatch;
      if (!allowedNodeIds.has(id) && !allKnownIds.has(id)) {
        throw new Error(`cannot update unknown node: ${id}`);
      }
      if (!ALLOWED_NODE_FIELDS.has(field)) {
        throw new Error(`cannot update field: ${field}. Allowed: ${[...ALLOWED_NODE_FIELDS].join(", ")}`);
      }
      // Validate value based on field
      if (field === "type") {
        if (!VALID_TYPES.has(value as NodeType)) {
          throw new Error(`invalid type value: ${String(value)}`);
        }
      } else if (field === "status") {
        if (!VALID_STATUSES.has(value as string)) {
          throw new Error(`invalid status value: ${String(value)}. Allowed: ${[...VALID_STATUSES].join(", ")}`);
        }
      } else if (["contradicts", "dependsOn", "temporalAfter", "temporalBefore"].includes(field)) {
        if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
          throw new Error(`${field} must be an array of strings`);
        }
        // Validate that referenced ids exist
        for (const refId of value as string[]) {
          if (!allKnownIds.has(refId) && !allowedNodeIds.has(refId)) {
            throw new Error(`edge references unknown node: ${refId}`);
          }
        }
      }
      fieldUpdates.push({ nodeId: id, field, value });
    } else if (rawMatch) {
      // /raw/{id} - full node replacement not allowed in structuring
      throw new Error("structuring cannot replace entire nodes; use field-level patches");
    } else if (summaryMatch) {
      // /summary/{id} - summary update
      const [, id] = summaryMatch;
      if (!allowedNodeIds.has(id) && !allKnownIds.has(id)) {
        throw new Error(`cannot update summary for unknown node: ${id}`);
      }
      if (typeof value !== "string") {
        throw new Error("summary value must be string");
      }
      summaryPatches.push({ op: op as Patch["op"], path, value });
    } else {
      throw new Error(`invalid path format: ${path}`);
    }
  }
  return { fieldUpdates, summaryPatches };
}

/**
 * Merge field updates into full node patches that the engine can apply.
 */
function mergeFieldUpdatesIntoPatches(
  fieldUpdates: FieldUpdate[],
  state: EchoState
): Patch[] {
  // Group updates by nodeId
  const updatesByNode = new Map<string, FieldUpdate[]>();
  for (const update of fieldUpdates) {
    const existing = updatesByNode.get(update.nodeId) ?? [];
    existing.push(update);
    updatesByNode.set(update.nodeId, existing);
  }

  const patches: Patch[] = [];
  for (const [nodeId, updates] of updatesByNode) {
    const existingNode = state.raw[nodeId];
    if (!existingNode) {
      // Node doesn't exist, skip (shouldn't happen if validation is correct)
      continue;
    }

    // Clone and apply field updates
    const updatedNode = { ...existingNode };
    for (const { field, value } of updates) {
      (updatedNode as Record<string, unknown>)[field] = value;
    }

    patches.push({
      op: "replace",
      path: `/raw/${nodeId}`,
      value: updatedNode,
    });
  }

  return patches;
}

/**
 * Check if an API key is available (without throwing).
 */
export function hasApiKey(opts: OpenAICompatibleOptions): boolean {
  const key =
    opts.apiKey ??
    (globalThis as any)?.process?.env?.OPENAI_API_KEY ??
    (globalThis as any)?.process?.env?.VITE_OPENAI_API_KEY ??
    (typeof import.meta !== "undefined"
      ? (import.meta as any)?.env?.VITE_OPENAI_API_KEY
      : undefined);
  return Boolean(key && key.trim().length > 0);
}

/**
 * Structure unstructured nodes by calling an LLM to classify types and propose edges.
 *
 * @param state Current EchoState
 * @param unstructuredIds IDs of nodes that need structuring
 * @param goal Current user goal (for context)
 * @param opts OpenAI-compatible options
 * @returns Patches to apply for structuring
 */
export async function structureNodesWithContext(
  state: EchoState,
  unstructuredIds: string[],
  goal: string,
  opts: OpenAICompatibleOptions = {}
): Promise<StructureNodesResult> {
  if (unstructuredIds.length === 0) {
    return { patches: [], attempts: 0 };
  }

  // Build context showing existing nodes
  const context = buildContext(state);

  // Build list of unstructured nodes for the LLM
  const unstructuredNodes = unstructuredIds
    .map((id) => {
      const node = state.raw[id];
      if (!node) return null;
      return `- ${id}: "${node.summary ?? JSON.stringify(node.details)}"`;
    })
    .filter(Boolean)
    .join("\n");

  const userMessage = [
    `Goal: ${goal}`,
    "",
    "Existing memory context:",
    context,
    "",
    "New unstructured nodes to classify and connect:",
    unstructuredNodes,
    "",
    "Emit patches to structure these nodes. Output JSON array only.",
  ].join("\n");

  const baseMessages = [
    { role: "system", content: STRUCTURE_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  const allowedNodeIds = new Set(unstructuredIds);
  const allKnownIds = new Set<string>([
    ...Object.keys(state.raw ?? {}),
    ...Object.keys(state.summary ?? {}),
  ]);

  // Calculate appropriate max_tokens for structuring
  // With edges, each node can generate multiple patches:
  //   - Type patch: ~30 tokens
  //   - dependsOn edges: ~40 tokens per edge (can have multiple)
  //   - temporalAfter edges: ~40 tokens per edge
  //   - Summary patches: ~30 tokens
  // So each node might need 100-200 tokens if it has multiple edges
  // We estimate 3 patches per node on average (type + 2 edges) = ~120 tokens per node
  const estimatedTokensNeeded = Math.max(256, unstructuredIds.length * 120);
  const maxTokensForStructuring = Math.min(estimatedTokensNeeded, 8192); // Cap at 8k tokens (increased from 4k)
  
  const structuringOpts = {
    ...opts,
    maxTokens: opts.maxTokens ?? maxTokensForStructuring,
  };

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const messages =
      attempt === 0
        ? baseMessages
        : [
            ...baseMessages,
            {
              role: "user",
              content: `Previous output invalid: ${lastError}. Return ONLY a JSON array of patches following the rules.`,
            },
          ];
    const content = await fetchChat(messages, structuringOpts);
    
    // Log raw LLM response for debugging
    if (attempt === 0) {
      console.log(`\n[STRUCTURING DEBUG] Processing ${unstructuredIds.length} nodes with max_tokens=${structuringOpts.maxTokens}`);
      console.log(`[STRUCTURING DEBUG] Raw LLM response length: ${content.length} chars`);
      if (content.length < 1000) {
        console.log(`[STRUCTURING DEBUG] Full response:\n${content}`);
      } else {
        console.log(`[STRUCTURING DEBUG] First 500 chars: ${content.substring(0, 500)}`);
        console.log(`[STRUCTURING DEBUG] Last 500 chars: ${content.substring(Math.max(0, content.length - 500))}`);
      }
    }
    
    try {
      const { fieldUpdates, summaryPatches } = validateStructuringPatches(
        content,
        allowedNodeIds,
        allKnownIds
      );
      // Merge field updates into full node patches
      const nodePatchesFromFields = mergeFieldUpdatesIntoPatches(fieldUpdates, state);
      const allPatches = [...nodePatchesFromFields, ...summaryPatches];
      
      // Debug: Count edge patches
      const edgePatches = fieldUpdates.filter((f) => 
        ["dependsOn", "temporalAfter", "temporalBefore", "contradicts"].includes(f.field)
      );
      if (attempt === 0) {
        console.log(`[STRUCTURING DEBUG] Generated ${fieldUpdates.length} field updates, ${edgePatches.length} edge updates`);
        if (edgePatches.length > 0) {
          console.log(`[STRUCTURING DEBUG] Edge patches (first 5):`);
          edgePatches.slice(0, 5).forEach((ep) => {
            console.log(`  ${ep.nodeId}.${ep.field} = ${JSON.stringify(ep.value)}`);
          });
        }
      }
      
      return { patches: allPatches, attempts: attempt + 1, raw: content };
    } catch (err) {
      lastError = String(err);
      console.error(`[STRUCTURING DEBUG] Validation error on attempt ${attempt + 1}:`, lastError);
      if (attempt === 1) {
        // Log the problematic content around the error position
        if (lastError.includes("position")) {
          const match = lastError.match(/position (\d+)/);
          if (match) {
            const pos = parseInt(match[1]);
            const start = Math.max(0, pos - 100);
            const end = Math.min(content.length, pos + 100);
            console.error(`\n[STRUCTURING DEBUG] Content around error position ${pos}:`);
            console.error(content.substring(start, end));
            console.error(`\nCharacter at position ${pos}: "${content[pos]}"`);
          }
        }
        throw new Error(`structureNodesWithContext validation failed: ${lastError}`);
      }
    }
  }
  throw new Error("structureNodesWithContext unreachable");
}
