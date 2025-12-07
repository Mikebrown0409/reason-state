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

### Minimal API (<10 LOC)
```ts
import { planAndAct } from "reason-state/agent/planAndAct.js";

const res = await planAndAct({
  goal: "Plan Tokyo trip",
  budget: 4000,
  facts: [{ summary: "Allergic to sushi" }],
  bookingDates: { startDate: "2025-12-10", endDate: "2025-12-15" }
});
console.log(res.agentMessage);        // agent note (always present; fallback if model skips)
console.log(res.history.at(-1)?.state); // governed state (raw + summaries)
```

### Facade
```ts
import { addNode, updateNode, recompute, rollbackSubtree } from "reason-state/api/facade.js";
```
- `addNode/updateNode`: validated, append-only patches.
- `recompute`: semantic plan+act (uses built-in prompt, agent-note fallback, booking governance).
- `rollbackSubtree`: temporal/tool replay for a specific node id.

## What’s in the box
- JSON-first governed graph: raw vs summary, lineage, timestamps, edges (`depends_on`, `contradicts`, `temporalBefore/After`), no deletes.
- Patch DSL (add/replace only), Zod-validated, engine-assigned UUIDs.
- Governance: dirty/unknown gating, dependency/temporal blocking, contradiction detection, self-heal/rollback helpers.
- Context builder: summaries-only, deterministic ordering, prioritizes dirty/new/assumptions, token budgeted.
- Replay/time-travel: NDJSON append-only log + checkpoints; `replayFromLog` deterministic rebuild.
- Tools: Grok 4.1 planner (strict prompt/validation/backoff), X search (fails loud w/o token), real-ish booking with calendar clash + Stripe-test + governance gating.
- Default agent wrapper: `planAndAct` with built-in prompt, agent-note fallback, booking supersede, single-call signature.

## File map
- `src/engine`: core ReasonState, types, storage, reconciliation, replay.
- `src/tools`: `grokChat` (planner integration). Example tools (`mockBooking`, `xSearch`) live in `examples/` and are not shipped by default.
- `src/context`: context builder.
- `src/agent/planAndAct.ts`: default helper (plan+act, fallback).
- `src/api/facade.ts`: minimal facade (add/update/recompute/rollback).
- `examples/agents`: dag/simple examples; example tools.
- `demo`: DemoApp (rollback/recompute/diff/replay UI).

## Demo flow
- Plan trip → add facts → semantic recompute (agent note updates, diff view).
- Date clash → rollback subtree (temporal/tool), supersede stale blocked bookings.
- Replay & verify: rebuild from log and show hash match/badges.

## Notes
- No fallbacks: missing keys error loudly (Grok/X).
- Calendar holds: mock booking enforces clash; supersede clears stale blocked nodes; identical hold reuse allowed.
- Governance first: actions blocked on unknown/dirty/deps/temporal; rollback/recompute provided.

## Env
- Copy `.env.example` → `.env`:
  - `VITE_GROK_API_KEY` (required)
  - `VITE_X_BEARER_TOKEN` (required if using X search)
  - `VITE_X_BASE_URL`, `VITE_GROK_BASE_URL` (optional)

## Verified behaviors
- Grok 4.1 non-reasoning with strict prompt/validation/backoff; no details allowed; add/replace only.
- Summaries-only context; dirty/new/assumptions prioritized; no raw details to model.
- Booking tool gates unknowns, missing dates, and date clashes; supersede on success.
- Determinism: replay from NDJSON log matches live state; replay badge shows patch count and match.
- No silent fallbacks: missing Grok/X keys throw.

## Deploy (draft)
- Set env: `GROK_API_KEY` (or `X_BEARER_TOKEN`) for X search.
- For persistence on serverless, mount a writable SQLite file or provide remote persistence; otherwise falls back to in-memory.

## Dev API surface (current)
- `ReasonState` — governed state + applyPatchesWithCheckpoint/replayFromLog.
- `planAndAct` — default plan+act wrapper (prompt baked, agent-note fallback, booking).
- `facade` — `addNode`, `updateNode`, `recompute`, `rollbackSubtree`.
- `contextBuilder.buildContext` — deterministic summaries-only context.
- `grokChat.grokPlanWithContext` — validated Grok call (strict patch rules).

## Docs
- System prompt: `docs/system-prompt.md` (add/replace only; no /raw writes from model; statuses open/blocked/resolved/dirty).
- Context builder: `docs/context-builder.md`.
- NDJSON log + replay usage noted above.

## Demo checklist (current)
- Simple mode uses `planAndAct` (no X): add facts → recompute → agent-note updates; date clash → rollback subtree; diff and replay badges shown.
- DAG mode: rollback/recompute, node chips, diff, replay, governance badges.
- Replay & verify shows log length and raw/summary match.

