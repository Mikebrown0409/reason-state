import crypto from "crypto";
import type { MemoryRunner, RetrieveResult, Stats } from "./types.js";
import { ReasonState } from "../../src/index.js";

function estTokens(text: string): number {
  return Math.max(1, Math.ceil((text ?? "").length / 4));
}

function defaultStats(context: string): Stats {
  return {
    contextChars: context.length,
    estTokens: estTokens(context),
    unknownCount: 0,
    dirtyCount: 0,
    blockedCount: 0,
  };
}

export function createPromptAppendRunner(opts: { maxChars: number }): MemoryRunner {
  let memory = "";
  return {
    name: "prompt_append",
    add: (key, value) => {
      memory += `\nADD ${key}: ${value}\n`;
    },
    update: (key, value) => {
      memory += `\nUPDATE ${key}: ${value}\n`;
    },
    retract: (key) => {
      memory += `\nRETRACT ${key}\n`;
    },
    retrieve: (goal) => {
      const ctx = `MEMORY:\n${memory}\nGOAL:\n${goal}\n`;
      const clipped = ctx.length > opts.maxChars ? ctx.slice(-opts.maxChars) : ctx;
      return { context: clipped, stats: defaultStats(clipped) };
    },
  };
}

export function createKvLatestRunner(opts: { maxChars: number }): MemoryRunner {
  const kv = new Map<string, string>();
  return {
    name: "kv_latest",
    add: (key, value) => {
      kv.set(key, value);
    },
    update: (key, value) => {
      kv.set(key, value);
    },
    retract: (key) => {
      kv.delete(key);
    },
    retrieve: (goal) => {
      const lines = Array.from(kv.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}: ${v}`);
      const ctx = `MEMORY:\n${lines.join("\n")}\nGOAL:\n${goal}\n`;
      const clipped = ctx.length > opts.maxChars ? ctx.slice(0, opts.maxChars) : ctx;
      return { context: clipped, stats: defaultStats(clipped) };
    },
  };
}

export function createReasonStateRunner(opts: { maxTokens: number }): MemoryRunner {
  const rs = new ReasonState({ maxTokens: opts.maxTokens });
  return {
    name: "reason_state",
    add: async (key, value) => {
      await rs.add(value, { key, type: "fact" });
    },
    update: async (key, value) => {
      // For parity with other baselines, treat update as “new fact with same key”.
      await rs.add(value, { key, type: "fact" });
    },
    retract: async (key) => {
      await rs.retract(key, { heal: true, reason: "proofpack" });
    },
    retrieve: async (goal) => {
      const { context, stats } = await rs.retrieve(goal);
      return { context, stats };
    },
  };
}

export function stableHash(obj: unknown): string {
  const text = JSON.stringify(obj);
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);
}


