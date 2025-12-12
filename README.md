## reason-state

Governed long-term memory for agents. Summaries-only context, token-budgeted, replayable. **Drop in one object**, keep governance **explicit** (`retract()`, `heal()`, `rollback()`), and run **keyless** in retrieve-only mode.

**Use it like a note-taking logger:** add facts → retrieve governed context. If you need to update/retract later, give that fact a stable `key` (optional).

## Quick start (30s)
```bash
npm install reason-state
```
```ts
import { ReasonState } from "reason-state";
import { injectMemoryContext } from "reason-state/integrations/openai";

const rs = new ReasonState({
  apiKey: process.env.OPENAI_API_KEY, // optional
  model: "gpt-4o-mini",               // optional
  maxTokens: 2500,                    // ~10k chars budget
});

// Zero-friction: just add text (we generate an id)
await rs.add("User hates meetings on Friday");

// Recommended for anything you may update/retract later: provide a stable key.
await rs.add("User hates meetings on Friday", { key: "user:pref:no_friday_meetings", type: "fact" });

const goal = "When should we schedule the retro?";
const messages = [{ role: "user", content: goal }];

// Keyless-safe retrieve-only (no LLM): inject governed context into your messages[]
const { messages: withMemory, stats } = await injectMemoryContext(rs, messages, { goal });
// Pass `withMemory` to your model call.
console.log("ROI stats:", stats);

// Plan (default): builds context, calls your model, applies patches (requires a key)
const { patches } = await rs.plan(goal);

// Explicit governance (no hidden recompute)
await rs.retract("user:pref:no_friday_meetings"); // retract by stable key (blocked + dirty)
await rs.heal();                           // resolves contradictions + reconciles
await rs.rollback("subtree-root-node-id"); // subtree rollback (optional)
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
- Stable surface:
  - Root: `ReasonState` (simple), `ReasonStateAdvanced`
  - Subpaths: `reason-state/agent/planAndAct`, `reason-state/context`, `reason-state/api`, `reason-state/tools/*`
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
- Docker (from `apps/server/docker/`): `docker build -t reason-state -f apps/server/docker/Dockerfile . && docker run -p 3000:3000 reason-state`.
- Compose: `docker-compose -f apps/server/docker/docker-compose.yaml up --build`.

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
import { ReasonState, InMemoryVectorStore } from "reason-state";
const vs = new InMemoryVectorStore();
vs.upsert([{ id: "fact1", text: "Beach resort has good weather" }]);
const rs = new ReasonState({ vectorStore: vs, vectorTopK: 5 });
await rs.add("Beach resort has good weather", {
  key: "fact:weather:beach_resort",
  type: "fact",
  sourceType: "vector",
  sourceId: "fact1",
});
const res = await rs.query("Where to host the offsite?");
```

## Repo layout
- `src/` library code (engine, context, tools, facade).
- `apps/server/` HTTP facade; build output in `dist/server`.
- `apps/server/docker/` Docker assets for the HTTP service.
- `examples/` agents/tools; `apps/demo/` for CLI/UI demo; `apps/studio/` for the debugger UI (experimental).
- `tests/`: unit/integration; `tests/live/` are key-gated Grok/OpenAI runs (skipped when no keys).
- `benchmarks/` longmemeval; `docs/` reference material.

## Studio (experimental)
- Dev: `npm run dev:studio` (bundled keyless sample trace).
- Build: `npm run build:studio` (outputs to `dist/studio`).
- Features: timeline carousel, replay log, context view, state diff, mode/vector toggles (actions stubbed for now).

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
- Adoption guide: `docs/adoption.md`

## Env
- `OPENAI_API_KEY` (or compatible)
- Optional: `ANTHROPIC_API_KEY`, `GROK_API_KEY`, `..._BASE_URL`

