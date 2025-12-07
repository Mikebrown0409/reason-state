import type { Patch } from "../engine/types.js";

type SearchResult = { id: string; text: string; author?: string; created_at?: string };

declare const __VITE_X_BEARER_TOKEN__: string;
declare const __VITE_GROK_API_KEY__: string;

function getBearer(): string | undefined {
  const token =
    (globalThis as any)?.process?.env?.X_BEARER_TOKEN ??
    (globalThis as any)?.process?.env?.VITE_X_BEARER_TOKEN ??
    (globalThis as any)?.process?.env?.GROK_API_KEY ??
    (globalThis as any)?.process?.env?.VITE_GROK_API_KEY ??
    (typeof import.meta !== "undefined"
      ? (import.meta as any)?.env?.VITE_X_BEARER_TOKEN ?? (import.meta as any)?.env?.VITE_GROK_API_KEY
      : undefined) ??
    (typeof __VITE_X_BEARER_TOKEN__ !== "undefined" && __VITE_X_BEARER_TOKEN__.length > 0
      ? __VITE_X_BEARER_TOKEN__
      : undefined) ??
    (typeof __VITE_GROK_API_KEY__ !== "undefined" && __VITE_GROK_API_KEY__.length > 0
      ? __VITE_GROK_API_KEY__
      : undefined) ??
    (typeof window !== "undefined"
      ? (window as any)?.VITE_X_BEARER_TOKEN ?? (window as any)?.VITE_GROK_API_KEY
      : undefined);
  if (typeof token === "string" && token.trim().length === 0) return undefined;
  return token;
}

export async function xSearch(query: string): Promise<Patch[]> {
  const token = getBearer();
  if (!token) {
    console.warn("X search skipped: no X_BEARER_TOKEN / GROK_API_KEY / VITE_ env set");
    return [];
  }
  const base = typeof window !== "undefined" ? "/x-api" : "https://api.twitter.com";
  const url = new URL(`${base}/2/tweets/search/recent`, typeof window !== "undefined" ? window.location.origin : undefined);
  const startTime = new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString();
  url.searchParams.set("query", `${query} lang:en`);
  url.searchParams.set("start_time", startTime);
  url.searchParams.set("max_results", "10"); // API requires 10-100
  try {
    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    if (!res.ok) {
      console.error("xSearch fetch error", res.status, await res.text());
      return [];
    }
    const data = (await res.json()) as { data?: SearchResult[] };
    return (data.data ?? []).map((hit) => ({
      op: "add",
      path: `/raw/${hit.id}`,
      value: {
        id: hit.id,
        type: "assumption",
        summary: hit.text,
        details: { author: hit.author, created_at: hit.created_at, query },
        assumptionStatus: "valid"
      }
    }));
  } catch (err) {
    console.error("xSearch fetch failed", err);
    return [];
  }
}

