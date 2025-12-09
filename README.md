# reason-state

Deterministic, governed memory for AI agents: JSON-first state, patch DSL, summaries-only context, governance (unknown/dirty/depends_on/temporal/contradicts), replay/time-travel, and partial recompute. TypeScript-only; minimal deps.

## Quick start
Install:
```bash
npm install reason-state
```

### Core flow (production)
```ts
import { addNode, updateNode, rollbackSubtree } from "reason-state/api/facade.js";
import { applyPatches } from "reason-state/engine/ReasonState.js";
import { buildContext } from "reason-state/context/contextBuilder.js";

// 1) Write state
let state = addNode({ id: "task", type: "planning", summary: "Refactor module" });
state = updateNode("task", { summary: "Refactor payment module" }, {}, state);

// 2) Build deterministic, summaries-only context for your model (optional but recommended)
const context = buildContext(state);
// ...call your LLM/tool with `context`...

// 3) Apply returned patches (from your model/tool)
const modelPatches = [
  { op: "add", path: "/summary/agent-note", value: "Next: split payment service" },
];
state = applyPatches(modelPatches, state);

// 4) Recovery/determinism tools
// rollbackSubtree("task", ...) or replayFromLog(...) when needed
```

### Facade (core API)
```ts
import { addNode, updateNode, recompute, rollbackSubtree } from "reason-state/api/facade.js";
```
- `addNode/updateNode`: validated, append-only patches.
- `recompute`: optional semantic plan (built-in prompt, agent-note fallback).
- `rollbackSubtree`: temporal/tool replay for a specific node id (you supply the tool).

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

## Docs
- System prompt: `docs/system-prompt.md` (add/replace only; no /raw writes from model; statuses open/blocked/resolved/dirty).
- Context builder: `docs/context-builder.md`.
- NDJSON log + replay usage noted above.

## Demo checklist (current)
- Simple mode uses `planAndAct` (no X): add facts → recompute → agent-note updates; date clash → rollback subtree; diff and replay badges shown.
- DAG mode: rollback/recompute, node chips, diff, replay, governance badges.
- Replay & verify shows log length and raw/summary match.

