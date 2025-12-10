# reason-state

Governed long-term memory for agents. Summaries-only context, token-budgeted, replayable. Default API is 3 calls: add, query, update. Works with any OpenAI-compatible endpoint (OpenAI, Groq, Anthropic via base/model).

## Quick start (30s)
```bash
npm install reason-state
```
```ts
import ReasonState from "reason-state";

const rs = new ReasonState({
  apiKey: process.env.OPENAI_API_KEY,   // OpenAI/Groq-compatible
  model: "gpt-4o-mini",
  maxTokens: 2500,                      // ~10k chars budget
});

await rs.add("User hates meetings on Friday");

// Retrieve-only (no LLM): pruned, budgeted context
const { context } = await rs.query("When should we schedule the retro?", { mode: "retrieve" });

// Plan (default): builds context, calls your model, applies patches
const { patches } = await rs.query("When should we schedule the retro?");

await rs.update("node-id-123", { retracted: true, reason: "New policy" });
```

## Demo (1 command)
```bash
npm run demo
```
Opens a minimal playground that ingests a few facts, shows balanced context, and runs a sample plan with your API key. (If no key set, it still shows retrieval mode.)

## Why use it
- Token-efficient context (balanced mode keeps blockers/goals/recent first; summarizes overflow).
- Governance: dirty/unknown/assumption status, temporal/depends_on/contradicts edges, no deletes.
- Deterministic replay: append-only log + checkpoints.
- Provider-agnostic: OpenAI-compatible by default; swap base/model/apiKey.

## Browser vs Node
- Node: default persistence uses SQLite + log.
- Browser/Vite/Next: defaults to in-memory (no persistence across refresh). For persistence, pass a remote storage driver (e.g., HTTP).

## Benchmarks (early, Grok, TPM-limited)
LongMemEval/LoCoMo, first convo, `maxTokens=800`, `qaLimit=3`, model `grok-4-1-fast-non-reasoning`:
- reason-state: F1≈0.095, tokens≈907
- raw dump:   F1≈0.0175, tokens≈7221
Token reduction ~8×; F1 lift ~5.4×. (Small slice due to 12k TPM key; full run planned. Runner: `benchmarks/longmemeval`.)

## Providers
- OpenAI-compatible planner (works with OpenAI, Groq, Anthropic via base/model/apiKey).
- Grok, OpenAI, Anthropic adapters are included; swap by changing `baseUrl`/`model`.

## Advanced / links
- Advanced engine: `import { ReasonStateAdvanced } from "reason-state/engine"`.
- Context builder docs: `docs/context-builder.md`
- System prompt: `docs/system-prompt.md`
- Remote storage driver: `src/engine/storageRemote.ts`

## Env
- `OPENAI_API_KEY` (or compatible)
- Optional: `ANTHROPIC_API_KEY`, `GROK_API_KEY`, `..._BASE_URL`

