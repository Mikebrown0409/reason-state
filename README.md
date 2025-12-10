# reason-state

Deterministic, governed memory for AI agents: JSON-first state, patch DSL, summaries-only context, governance (unknown/dirty/depends_on/temporal/contradicts), replay/time-travel, and partial recompute. TypeScript-only; minimal deps.

## Quick start
Install:
```bash
npm install reason-state
```

### 3-function quickstart (default)
```ts
import ReasonState from "reason-state";

const rs = new ReasonState({
  apiKey: process.env.OPENAI_API_KEY,          // works with OpenAI/Groq-compatible endpoints
  model: "gpt-4o-mini",                        // or your provider model
  maxTokens: 2500,                             // ~10k chars budget
});

// 1) Add
await rs.add("User hates meetings on Friday");

// 2) Query
// - mode: "plan" (default) calls planner + applies patches
// - mode: "retrieve" returns pruned context without LLM call
const { patches, state, context } = await rs.query("When should we schedule the retro?", {
  mode: "plan",
});

// 3) Update/retract
await rs.update("node-id-123", { retracted: true, reason: "New policy" });
```

### Browser vs Node
- Node: default persistence uses SQLite + log.
- Browser/Vite/Next: defaults to in-memory storage (no persistence across refresh). For persistence, pass a custom remote storage driver (e.g., HTTP-based).

### Optional: core/advanced APIs
- `ReasonStateAdvanced` — full engine and `applyPatches` (named export).
- `facade` — `addNode`, `updateNode`, `recompute`, `rollbackSubtree` (advanced).
- Planners: `grokChat.grokPlanWithContext`, `openaiPlanner`, `anthropicPlanner`, `openaiCompatiblePlanner`.

## What’s in the box
- JSON-first governed graph: raw vs summary, lineage, timestamps, edges (`depends_on`, `contradicts`, `temporalBefore/After`), no deletes.
- Patch DSL (add/replace only), Zod-validated, engine-assigned UUIDs.
- Governance signals: dirty/unknown/assumption status; dependency/temporal/contradiction handling; optional gating via `canExecute`; rollback helper.
- Context builder: summaries-only, deterministic ordering, prioritizes dirty/new/assumptions, token budgeted; balanced/aggressive modes adapt to a hard `maxChars`, keep blockers/goal chain/recent changes first, and summarize overflow instead of dropping it.
- Replay/time-travel: NDJSON append-only log + checkpoints; `replayFromLog` deterministic rebuild.
- Planners: Grok 4.1, OpenAI, Anthropic, and a generic OpenAI-compatible adapter (strict validation/backoff). Bring your own LLM via the same planner interface.
- Optional helper: `plan` with built-in prompt and agent-note fallback (plan-only). Examples live in `examples/` and are not shipped.

## File map (shipped)
- `src/engine`: core ReasonState, types, storage, reconciliation, replay (plus optional remote storage driver).
- `src/tools`: planners (`grokChat`, `openaiPlanner`, `anthropicPlanner`, `openaiCompatiblePlanner`).
- `src/context`: context builder.
- `src/agent/planAndAct.ts`: default helper (plan-only, fallback). Also exported as `agent/plan`. Deprecated alias: `planAndAct`.
- `src/api/facade.ts`: minimal facade (add/update/recompute/rollback).
- `src/index.ts`: top-level exports.

## Env
- Copy `.env.example` → `.env`:
  - `VITE_GROK_API_KEY` (required for Grok planner)
  - `OPENAI_API_KEY` / `VITE_OPENAI_API_KEY` (for OpenAI planner)
  - `ANTHROPIC_API_KEY` / `VITE_ANTHROPIC_API_KEY` (for Anthropic planner)
  - `VITE_GROK_BASE_URL`, `OPENAI_BASE_URL`, `ANTHROPIC_BASE_URL` (optional)

## Migration / plug-in (any OpenAI-style LLM, e.g., Groq)
Minimal loop:
```ts
import { ReasonState } from "reason-state/engine";
import { buildContext } from "reason-state/context";
import { openaiCompatiblePlanWithContext } from "reason-state/tools/openaiCompatiblePlanner";

const engine = new ReasonState({ dbPath: "./state.db" });
const goal = "Plan feature X";

async function planTurn() {
  const ctx = buildContext(engine.snapshot);
  const res = await openaiCompatiblePlanWithContext(engine.snapshot, goal, {
    baseUrl: "https://api.groq.com/openai/v1", // or your OpenAI-compatible endpoint
    model: "mixtral-8x7b-32768",               // your model
    apiKey: process.env.GROQ_API_KEY,
  });
  engine.applyPatches(res.patches);
  return res.patches;
}
```
If you already call your LLM, just validate and apply:
```ts
import { validateModelPatches } from "reason-state/tools/grokChat";
const patches = validateModelPatches(modelOutput, new Set(Object.keys(state.raw)));
engine.applyPatches(patches);
```
Persistence: default in-memory/SQLite; or pass `storage: createRemoteStorageDriver(baseUrl)` in `ReasonStateOptions`.

## Verified behaviors
- Strict patch validation/backoff for shipped planners; add/replace summaries only.
- Summaries-only context; dirty/new/assumptions prioritized; no raw details to model.
- Determinism: replay from NDJSON log matches live state.

## Dev API surface (current)
- `ReasonState` — governed state + applyPatchesWithCheckpoint/replayFromLog; optional `storage` driver to swap persistence (local SQLite/in-memory by default).
- `plan` — optional plan helper (prompt baked, agent-note fallback; plan-only). `planAndAct` remains as a deprecated alias.
- `facade` — `addNode`, `updateNode`, `recompute`, `rollbackSubtree`.
- `contextBuilder.buildContext` — deterministic summaries-only context.
- Planners: `grokChat.grokPlanWithContext`, `openaiPlanner.openaiPlanWithContext`, `anthropicPlanner.anthropicPlanWithContext` — strict validation/backoff; plug your own provider via the same planner interface.

## Benchmarks (early result, Grok, TPM-limited)
- Dataset: LongMemEval/LoCoMo (`locomo10.json`), first convo, `maxTokens=800`, `qaLimit=3`, model `grok-4-1-fast-non-reasoning`.
- LLM F1/tokens:
  - reason-state: F1≈0.095, tokens≈907
  - raw dump: F1≈0.0175, tokens≈7221
- Token reduction: ~8×; F1 lift: ~5.4×.
- Footnote: small slice due to a 12k TPM key; full run planned when higher quota is available. Runner and flags: see `benchmarks/longmemeval/README.md`.

## Docs
- System prompt: `docs/system-prompt.md` (add/replace only; no /raw writes from model; statuses open/blocked/resolved/dirty).
- Context builder: `docs/context-builder.md`.
- NDJSON log + replay usage noted above.

## Demo checklist (current)
- Simple mode uses `planAndAct` (no X): add facts → recompute → agent-note updates; date clash → rollback subtree; diff and replay badges shown.
- DAG mode: rollback/recompute, node chips, diff, replay, governance badges.
- Replay & verify shows log length and raw/summary match.

