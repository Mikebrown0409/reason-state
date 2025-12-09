import { buildContext } from "../context/contextBuilder.js";
import type { EchoState, Patch } from "../engine/types.js";
import { SYSTEM_PROMPT, validateModelPatches } from "./grokChat.js";

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_OPENAI_BASE = "https://api.openai.com/v1";

export type OpenAIPlanResult = {
  patches: Patch[];
  attempts: number;
  lastError?: string;
  raw?: string;
};

function getKey(): string {
  const key =
    (globalThis as any)?.process?.env?.OPENAI_API_KEY ??
    (globalThis as any)?.process?.env?.VITE_OPENAI_API_KEY ??
    (typeof import.meta !== "undefined"
      ? (import.meta as any)?.env?.VITE_OPENAI_API_KEY
      : undefined);
  if (!key || key.trim().length === 0) {
    throw new Error("OPENAI_API_KEY (or VITE_OPENAI_API_KEY) is required for openaiPlanner");
  }
  return key;
}

function getBase(): string {
  return (
    (globalThis as any)?.process?.env?.OPENAI_BASE_URL ??
    (globalThis as any)?.process?.env?.VITE_OPENAI_BASE_URL ??
    (typeof import.meta !== "undefined"
      ? (import.meta as any)?.env?.VITE_OPENAI_BASE_URL
      : undefined) ??
    DEFAULT_OPENAI_BASE
  );
}

async function fetchOpenAI(messages: Array<{ role: string; content: string }>, model: string) {
  const apiKey = getKey();
  const base = getBase();
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, messages, max_tokens: 256 }),
  });
  if (!res.ok) {
    throw new Error(`openaiPlanner error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  const content = data.choices?.[0]?.message?.content ?? "";
  if (!content) throw new Error("openaiPlanner returned empty content");
  return content;
}

/**
 * OpenAI planner adapter: uses buildContext + SYSTEM_PROMPT and validates patches.
 */
export async function openaiPlanWithContext(
  state: EchoState,
  userGoal: string,
  model = DEFAULT_OPENAI_MODEL
): Promise<OpenAIPlanResult> {
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
    const content = await fetchOpenAI(messages, model);
    try {
      const patches = validateModelPatches(content, new Set<string>(knownIds));
      return { patches, attempts: attempt + 1, raw: content };
    } catch (err) {
      lastError = String(err);
      if (attempt === 1) {
        throw new Error(`openaiPlanWithContext validation failed: ${lastError}`);
      }
    }
  }
  throw new Error("openaiPlanWithContext unreachable");
}

