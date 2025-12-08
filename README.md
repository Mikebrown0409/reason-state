# reason-state

Deterministic, governed memory for AI agents: JSON-first state, patch DSL, summaries-only context, governance (unknown/dirty/depends_on/temporal/contradicts), replay/time-travel, and partial recompute. TypeScript-only; minimal deps.

## Quick start
Install:
```bash
npm install reason-state
```

```bash
npm install
npm run dev
```

### Minimal API (core path)
```ts
import { addNode, updateNode, recompute } from "reason-state/api/facade.js";
import { buildContext } from "reason-state/context/contextBuilder.js";

// Seed state
let state = addNode({ id: "task", type: "planning", summary: "Refactor module" });
state = updateNode("task", { summary: "Refactor payment module" }, {}, state);

// Build deterministic, summaries-only context for your model
const context = buildContext(state);
// ...call your LLM/tool with `context`...

// Apply new patches via recompute/plan helper (optional)
const res = await recompute({ goal: "Refactor payment module", initialState: state });
console.log(res.history.at(-1)?.state); // governed state (raw + summaries)
```

### Facade
```ts
import { addNode, updateNode, recompute, rollbackSubtree } from "reason-state/api/facade.js";
```
- `addNode/updateNode`: validated, append-only patches.
- `recompute`: semantic plan (uses built-in prompt, agent-note fallback).
- `rollbackSubtree`: temporal/tool replay for a specific node id (you supply the tool).

## What’s in the box
- JSON-first governed graph: raw vs summary, lineage, timestamps, edges (`depends_on`, `contradicts`, `temporalBefore/After`), no deletes.
- Patch DSL (add/replace only), Zod-validated, engine-assigned UUIDs.
- Governance signals: dirty/unknown/assumption status; dependency/temporal/contradiction handling; optional gating via `canExecute`; rollback helper.
- Context builder: summaries-only, deterministic ordering, prioritizes dirty/new/assumptions, token budgeted.
- Replay/time-travel: NDJSON append-only log + checkpoints; `replayFromLog` deterministic rebuild.
- Tools: Grok 4.1 planner (strict prompt/validation/backoff), X search (fails loud w/o token).
- Optional helper: `plan` with built-in prompt and agent-note fallback (plan-only). Examples (mock booking, coding agent) live in `examples/` and are not shipped.

## File map (shipped)
- `src/engine`: core ReasonState, types, storage, reconciliation, replay.
- `src/tools`: `grokChat` (planner integration).
- `src/context`: context builder.
- `src/agent/planAndAct.ts`: default helper (plan-only, fallback). Also exported as `agent/plan`. Deprecated alias: `planAndAct`.
- `src/api/facade.ts`: minimal facade (add/update/recompute/rollback).
- `src/index.ts`: top-level exports.

Not shipped: `examples/` agents/tools; demo UI.

## Demo flow (examples only)
- Plan → add facts → semantic recompute (agent note updates, diff view).
- Example booking/tooling lives in `examples/`; not shipped in package.
- Replay & verify: rebuild from log and show hash match/badges.

## Notes
- No fallbacks: missing keys error loudly (Grok/X).
- Governance first: actions blocked on unknown/dirty/deps/temporal; rollback/recompute provided.

## Env
- Copy `.env.example` → `.env`:
  - `VITE_GROK_API_KEY` (required)
  - `VITE_X_BEARER_TOKEN` (required if using X search)
  - `VITE_X_BASE_URL`, `VITE_GROK_BASE_URL` (optional)

## Verified behaviors
- Grok 4.1 non-reasoning with strict prompt/validation/backoff; no details allowed; add/replace only.
- Summaries-only context; dirty/new/assumptions prioritized; no raw details to model.
- Determinism: replay from NDJSON log matches live state; replay badge shows patch count and match.
- No silent fallbacks: missing Grok/X keys throw.

## Deploy (draft)
- Set env: `GROK_API_KEY` (or `X_BEARER_TOKEN`) for X search.
- For persistence on serverless, mount a writable SQLite file or provide remote persistence; otherwise falls back to in-memory.

## Dev API surface (current)
- `ReasonState` — governed state + applyPatchesWithCheckpoint/replayFromLog.
- `plan` — optional plan helper (prompt baked, agent-note fallback; plan-only). `planAndAct` remains as a deprecated alias.
- `facade` — `addNode`, `updateNode`, `recompute`, `rollbackSubtree`.
- `contextBuilder.buildContext` — deterministic summaries-only context.
- `grokChat.grokPlanWithContext` — validated Grok call (strict patch rules); plug your own planner if desired.

## Docs
- System prompt: `docs/system-prompt.md` (add/replace only; no /raw writes from model; statuses open/blocked/resolved/dirty).
- Context builder: `docs/context-builder.md`.
- NDJSON log + replay usage noted above.

## Demo checklist (current)
- Simple mode uses `planAndAct` (no X): add facts → recompute → agent-note updates; date clash → rollback subtree; diff and replay badges shown.
- DAG mode: rollback/recompute, node chips, diff, replay, governance badges.
- Replay & verify shows log length and raw/summary match.

