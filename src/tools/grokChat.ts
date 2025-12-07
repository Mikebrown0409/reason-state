import type { EchoState, Patch } from "../engine/types.js";
import { buildContext } from "../context/contextBuilder.js";

function getGrokKey(): string {
  const key =
    (globalThis as any)?.process?.env?.GROK_API_KEY ??
    (globalThis as any)?.process?.env?.VITE_GROK_API_KEY ??
    (typeof import.meta !== "undefined" ? (import.meta as any)?.env?.VITE_GROK_API_KEY : undefined) ??
    (typeof __VITE_GROK_API_KEY__ !== "undefined" ? __VITE_GROK_API_KEY__ : undefined);
  if (!key || key.trim().length === 0) {
    throw new Error("GROK_API_KEY (or VITE_GROK_API_KEY) is required for grokChat");
  }
  return key;
}

const DEFAULT_MODEL = "grok-4-1-fast-reasoning-latest";
const DEFAULT_BASE = "https://api.x.ai/v1";

const FEW_SHOT = [
  "Good example (do this):",
  '[{"op":"replace","path":"/summary/goal","value":"Goal: plan Tokyo under $4k (source: user/input-1)"}]',
  "",
  "Bad example (do NOT do this):",
  '[{"op":"add","path":"/raw/new-node","value":{"id":"new-node","details":{"secret":true}}}]'
].join("\n");

export const SYSTEM_PROMPT = [
  "You are Reason-State reconciliation. Governed JSON graph, append-only patches, no deletes.",
  "Rules (must follow exactly):",
  "- You may ONLY write to /summary/{id}. Do not write /raw; tools own details and structure.",
  "- Allowed ops: add or replace only.",
  "- Summary values must be strings; keep concise, faithful to context, and cite sourceType/sourceId when present.",
  "- Use existing node ids from context when updating; do NOT invent new ids. If unsure, return an empty array.",
  "- Maintain lineage in the summary text when relevant (e.g., mention sourceType/sourceId).",
  "- Output a JSON array of patches (no prose). If unsure, return an empty array.",
  "",
  FEW_SHOT
].join("\n");

declare const __VITE_GROK_API_KEY__: string;
declare const __VITE_GROK_BASE_URL__: string;

export async function grokChat(prompt: string, model = DEFAULT_MODEL): Promise<string> {
  const apiKey = getGrokKey();
  const base =
    (typeof import.meta !== "undefined" ? (import.meta as any)?.env?.VITE_GROK_BASE_URL : undefined) ??
    (typeof __VITE_GROK_BASE_URL__ !== "undefined" ? __VITE_GROK_BASE_URL__ : undefined) ??
    DEFAULT_BASE;

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 256
    })
  });

  if (!res.ok) {
    throw new Error(`grokChat error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("grokChat returned empty content");
  return content;
}

const ALLOWED_OPS = new Set(["add", "replace"]);

function validatePath(path: string): { bucket: "raw" | "summary"; id: string } {
  const match = path.match(/^\/(raw|summary)\/([^/]+)$/);
  if (!match) {
    throw new Error(`invalid path: ${path}`);
  }
  return { bucket: match[1] as "raw" | "summary", id: match[2] };
}

export function validateModelPatches(content: string, knownIds: Set<string>): Patch[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(`model output is not valid JSON: ${String(err)}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("model output must be a JSON array of patches");
  }

  const patches: Patch[] = [];
  for (const p of parsed) {
    if (!p || typeof p !== "object") throw new Error("patch must be an object");
    const { op, path, value } = p as Patch;
    if (!ALLOWED_OPS.has(op as string)) {
      throw new Error(`invalid op: ${String(op)}`);
    }
    if (typeof path !== "string") throw new Error("path must be string");
    const { bucket, id } = validatePath(path);

    if (bucket === "raw") {
      throw new Error("LLM patches may not write to /raw; summaries only");
    }

    // Replace must target known ids; add may be new.
    if (op === "replace" && !knownIds.has(id)) {
      throw new Error(`replace must target existing id: ${id}`);
    }

    // For summary, require string value.
    if (bucket === "summary" && typeof value !== "string") {
      throw new Error("summary value must be string");
    }

    // If the value is an object, validate status/id when present.
    if (bucket === "raw") {
      if (!value || typeof value !== "object") throw new Error("raw value must be object");
      if ("details" in (value as any)) {
        throw new Error("details not allowed from model; tools own details");
      }
      const status = (value as any).status;
      if (status !== undefined && !ALLOWED_STATUS.has(status as string)) {
        throw new Error(`invalid status: ${String(status)}`);
      }
      if ((value as any).id && (value as any).id !== id) {
        throw new Error(`value.id must match path id: ${id}`);
      }
    }

    patches.push({ op: op as Patch["op"], path, value });
    // Add known ids for subsequent patches to allow replace/summary updates in same batch.
    if (bucket === "raw") {
      knownIds.add(id);
    }
  }
  return patches;
}

async function fetchGrok(messages: Array<{ role: string; content: string }>, model = DEFAULT_MODEL): Promise<string> {
  const apiKey = getGrokKey();
  const base =
    (typeof import.meta !== "undefined" ? (import.meta as any)?.env?.VITE_GROK_BASE_URL : undefined) ??
    (typeof __VITE_GROK_BASE_URL__ !== "undefined" ? __VITE_GROK_BASE_URL__ : undefined) ??
    DEFAULT_BASE;

  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 256
    })
  });

  if (!res.ok) {
    throw new Error(`grokPlanWithContext error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("grokPlanWithContext returned empty content");
  return content;
}

/**
 * Grok plan with deterministic context; returns validated patches.
 * If the model returns invalid patches, we backoff once with the error.
 */
export type GrokPlanResult = {
  patches: Patch[];
  attempts: number;
  lastError?: string;
  raw?: string;
};

export async function grokPlanWithContext(
  state: EchoState,
  userGoal: string,
  model = DEFAULT_MODEL
): Promise<GrokPlanResult> {
  const context = buildContext(state);
  const baseMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Goal: ${userGoal}\nContext:\n${context}` }
  ];

  const knownIds = new Set<string>([
    ...Object.keys(state.raw ?? {}),
    ...Object.keys(state.summary ?? {})
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
              content: `Previous output invalid: ${lastError}. Return ONLY a JSON array of patches following the rules.`
            }
          ];
    const content = await fetchGrok(messages, model);
    try {
      const patches = validateModelPatches(content, new Set<string>(knownIds));
      return { patches, attempts: attempt + 1, raw: content };
    } catch (err) {
      lastError = String(err);
      if (attempt === 1) {
        throw new Error(`grokPlanWithContext validation failed: ${lastError}`);
      }
    }
  }
  throw new Error("grokPlanWithContext unreachable");
}

// Deprecated helper: retains a summary-only node for legacy callers.
export function grokPlanPatch(content: string): Patch {
  return {
    op: "add",
    path: "/raw/grok-plan",
    value: {
      id: "grok-plan",
      type: "planning",
      summary: content,
      details: { source: "grok" },
      sourceType: "grok-plan",
      sourceId: "grok-plan"
    }
  };
}

