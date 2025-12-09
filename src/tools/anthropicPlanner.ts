import { buildContext } from "../context/contextBuilder.js";
import type { EchoState, Patch } from "../engine/types.js";
import { SYSTEM_PROMPT, validateModelPatches } from "./grokChat.js";

const DEFAULT_ANTHROPIC_MODEL = "claude-3-5-sonnet-20240620";
const DEFAULT_ANTHROPIC_BASE = "https://api.anthropic.com/v1";

export type AnthropicPlanResult = {
  patches: Patch[];
  attempts: number;
  lastError?: string;
  raw?: string;
};

function getKey(): string {
  const key =
    (globalThis as any)?.process?.env?.ANTHROPIC_API_KEY ??
    (globalThis as any)?.process?.env?.VITE_ANTHROPIC_API_KEY ??
    (typeof import.meta !== "undefined"
      ? (import.meta as any)?.env?.VITE_ANTHROPIC_API_KEY
      : undefined);
  if (!key || key.trim().length === 0) {
    throw new Error("ANTHROPIC_API_KEY (or VITE_ANTHROPIC_API_KEY) is required for anthropicPlanner");
  }
  return key;
}

function getBase(): string {
  return (
    (globalThis as any)?.process?.env?.ANTHROPIC_BASE_URL ??
    (globalThis as any)?.process?.env?.VITE_ANTHROPIC_BASE_URL ??
    (typeof import.meta !== "undefined"
      ? (import.meta as any)?.env?.VITE_ANTHROPIC_BASE_URL
      : undefined) ??
    DEFAULT_ANTHROPIC_BASE
  );
}

async function fetchAnthropic(messages: Array<{ role: string; content: string }>, model: string) {
  const apiKey = getKey();
  const base = getBase();
  const res = await fetch(`${base}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      system: SYSTEM_PROMPT,
      messages,
      max_tokens: 256,
    }),
  });
  if (!res.ok) {
    throw new Error(`anthropicPlanner error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { content?: Array<{ text?: string }> };
  const content = data.content?.[0]?.text ?? "";
  if (!content) throw new Error("anthropicPlanner returned empty content");
  return content;
}

/**
 * Anthropic planner adapter: uses buildContext + SYSTEM_PROMPT and validates patches.
 */
export async function anthropicPlanWithContext(
  state: EchoState,
  userGoal: string,
  model = DEFAULT_ANTHROPIC_MODEL
): Promise<AnthropicPlanResult> {
  const context = buildContext(state);
  const baseMessages = [{ role: "user", content: `Goal: ${userGoal}\nContext:\n${context}` }];

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
    const content = await fetchAnthropic(messages, model);
    try {
      const patches = validateModelPatches(content, new Set<string>(knownIds));
      return { patches, attempts: attempt + 1, raw: content };
    } catch (err) {
      lastError = String(err);
      if (attempt === 1) {
        throw new Error(`anthropicPlanWithContext validation failed: ${lastError}`);
      }
    }
  }
  throw new Error("anthropicPlanWithContext unreachable");
}

