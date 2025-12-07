import type { Patch } from "../engine/types.js";

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

