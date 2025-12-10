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
CLI demo: ingests a few facts, shows balanced retrieval-only context, and if an API key is present runs one planner turn. Works without keys (planner step skipped).

## Why use it
- Token-efficient context (balanced mode keeps blockers/goals/recent first; summarizes overflow).
- Governance: dirty/unknown/assumption status, temporal/depends_on/contradicts edges, no deletes.
- Deterministic replay: append-only log + checkpoints.
- Provider-agnostic: OpenAI-compatible by default; swap base/model/apiKey.

## API guarantees (0.2.x)
- Stable surface: default export `ReasonState` (simple API), `ReasonStateAdvanced`, `planAndAct`, `buildContext`, `facade` helpers, storage drivers, and tool adapters under `reason-state/tools/*`.
- Invariants: append-only patch DSL (validated, no deletes), LLM may only write summaries (never `/raw`), lineage preserved, deterministic context builder (summaries-only, token-budgeted), log+checkpoint replay.
- Breaking changes are announced in `CHANGELOG.md`; new fields are additive where possible.

## Build & package
- `npm run build` emits ESM + type declarations to `dist/`. Subpath exports point to built files (see `package.json` `exports`).

## Browser vs Node
- Node: default persistence uses SQLite + log.
- Browser/Vite/Next: defaults to in-memory (no persistence across refresh). For persistence, pass a remote storage driver (e.g., HTTP).

## Keys and tests
- Keyless by default: `npm run demo` runs in retrieve-only with canned suggestions when no keys are set. Most unit tests are keyless.
- Key-gated suites: Grok/X-dependent tests/benches (`live*`, `bench:longmemeval`) require `GROK_API_KEY`/`OPENAI_API_KEY` and are skipped when missing.
- Package consumption check: `npm run test:pkg` builds `dist/` and verifies the published entrypoints resolve.

| Command/test                    | Needs keys?                   | Behavior without keys                    |
|---------------------------------|-------------------------------|------------------------------------------|
| `npm run demo`                  | No (planner skipped)          | Retrieve-only context + canned tips      |
| `npm run test`                  | No                            | Passes                                   |
| `npm run test:pkg`              | No                            | Passes (build + consumer check)          |
| `npm run test:agent*`           | No                            | Should pass (planner skipped)            |
| `vitest run tests/live*`        | Yes (`GROK_API_KEY`/X)        | Skipped with message                     |
| `npm run bench:longmemeval*`    | Yes (`GROK_API_KEY` + model)  | Fail loud / skip if no keys              |

## Run as a service (HTTP)
- Start locally (keyless retrieve-only): `npm run dev:server` (port 3000).
- Build+run: `npm run build:all && npm run start:server`.
- Docker (from `server/docker/`): `docker build -t reason-state -f server/docker/Dockerfile . && docker run -p 3000:3000 reason-state`.
- Compose: `docker-compose -f server/docker/docker-compose.yaml up --build`.

Endpoints (JSON):
- `GET /health` → `{ status: "ok" }`
- `POST /add` → `{ text | node, type?, summary?, id?, confidence? }` returns `{ state }`
- `POST /update` → `{ id, summary?, retracted?, reason? }` returns `{ state }`
- `POST /query` → `{ goal, mode?: "plan"|"retrieve" }` returns `{ patches, state, context }`

Examples:
```
curl -X POST http://localhost:3000/add -H "content-type: application/json" \
  -d '{"text":"User hates meetings on Friday","id":"friday"}'
curl -X POST http://localhost:3000/query -H "content-type: application/json" \
  -d '{"goal":"When should we schedule the retro?","mode":"retrieve"}'
```

Planner usage: set `OPENAI_API_KEY` (or GROK) and optional `OPENAI_MODEL`/`BASE_URL`. Without keys, planner is skipped and retrieve-only responses are returned.

## Optional embeddings / hybrid retrieval
- Pass a `vectorStore` into `ReasonStateSimple` to bias context with vector hits; defaults remain rule-based.
- Example:
```ts
import ReasonState, { InMemoryVectorStore } from "reason-state";
const vs = new InMemoryVectorStore();
vs.upsert([{ id: "fact1", text: "Beach resort has good weather" }]);
const rs = new ReasonState({ vectorStore: vs, vectorTopK: 5 });
await rs.add("Beach resort has good weather", { id: "fact1" });
const res = await rs.query("Where to host the offsite?");
```

## Repo layout
- `src/` library code (engine, context, tools, facade).
- `src/` library code (engine, context, tools, facade).
- `apps/server/` HTTP facade; build output in `dist/server`.
- `apps/server/docker/` Docker assets for the HTTP service.
- `examples/` agents/tools; `apps/demo/` for CLI/UI demo.
- `tests/`: unit/integration; `tests/live/` are key-gated Grok/OpenAI runs (skipped when no keys).
- `benchmarks/` longmemeval; `docs/` reference material.

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

