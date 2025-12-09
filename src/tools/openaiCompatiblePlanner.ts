import { buildContext } from "../context/contextBuilder.js";
import type { EchoState, Patch } from "../engine/types.js";
import { SYSTEM_PROMPT, validateModelPatches } from "./grokChat.js";

export type OpenAICompatiblePlanResult = {
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
