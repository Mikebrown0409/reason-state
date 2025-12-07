# reason-state (hackathon draft)

Light, deterministic OS layer for AI agents: patch-based reactive state, uncertainty-aware reasoning, self-heal, and replay. Built for the xAI Jarvis track. Total LOC <1,000; TypeScript-only; minimal dependencies per spec.

## Quick start (draft)
```bash
npm install
npm run dev
```

### Usage (engine)
```ts
import { ReasonState, applyPatches, retractAssumption } from "reason-state";

const engine = new ReasonState({ dbPath: ":memory:" });
applyPatches([{ op: "add", path: "/raw/u1", value: { id: "u1", type: "unknown" } }], engine.snapshot);
// will block until unknown resolved
retractAssumption("u1", engine.snapshot);
```

## Vision (condensed)
- Details vs summary duality: immutable raw data, LLM-generated summaries.
- Append-only patches with dirty propagation and governed actions.
- Unknown/assumption lifecycle, self-healing validator, contradiction archival.
- Replay/time travel with per-turn checkpoints and delta reapply.

## File map (target)
- `src/engine`: core ReasonState, types, storage, reconciliation.
- `src/tools`: X search + mock booking (blocked on unknowns).
- `src/adapters`: LangGraph wrapper.
- `src/ui`: Timeline + Assumption card components.
- `demo`: DemoApp and tests (45s flow: Tokyo → Amsterdam retract).

## Demo flow (goal)
1) Plan Tokyo retreat ($4k, Dec 12–19) → X search → Grok plan → mock booking.
2) Retract Tokyo → Amsterdam replay.
3) Budget tweak $4k ↔ $4.5k with partial replay.

## Notes
- Dependencies locked to whitelist; no extras without approval.
- X calls use bearer token (app-only). Set `X_BEARER_TOKEN` (or `GROK_API_KEY`) in env.
- Vercel deploy placeholder; SQLite with in-memory fallback included.

## Env
- Copy `.env.example` to `.env` and fill:
  - `VITE_X_BEARER_TOKEN`, `VITE_GROK_API_KEY` (required)
  - `VITE_X_BASE_URL`, `VITE_GROK_BASE_URL` (optional)

## What's verified (demo)
- Live X search populates assumptions.
- Live Grok plan patch applied to state.
- Mock booking gated by unknowns/dirty.
- Slider/time machine driven by live agent patches (X→Grok→booking).
- Determinism check button replays patches and compares state.
- Grok 4.1 used for plan/patching via deterministic, summaries-only context builder; patch DSL validated (no deletes).

## Deploy (draft)
- Set env: `GROK_API_KEY` (or `X_BEARER_TOKEN`) for X search.
- For persistence on serverless, mount a writable SQLite file or provide remote persistence; otherwise falls back to in-memory.

## Dev API surface (proposed minimal)
- `createEngine/ReasonState` — construct the state holder.
- `applyPatches(patches)` — apply validated patch DSL; appends to log, updates state.
- `checkpoint/restore/replay` — durability and deterministic rebuild.
- `contextBuilder.buildContext(state, options)` — deterministic, token-budgeted, summaries-only prompts.
- `runAgent/recompute` (optional export) — orchestrated flow that calls Grok 4.1 + tools and applies patches.
Everything else (tool calls, Grok prompts) is handled inside recompute/agent pipelines.

## Docs
- System prompt and context rules: `docs/system-prompt.md`
- Context builder contract and patch DSL: `docs/context-builder.md`
- `npm run build` then deploy `dist/` via Vercel/Netlify; `npm run dev` for local demo.
- Append-only patch log kept in state history; checkpoints persisted via `saveCheckpoint`/`restore`; `replayHistory` rebuilds deterministically from history (used in tests).

## Demo checklist (target)
- 45s flow: Tokyo → retract → Amsterdam; budget 4k ↔ 4.5k ↔ 4k with partial replay.
- Live X previews visible; metrics logged (tokens saved, blocked actions, self-heal); confetti on success.
- Actions blocked on unknowns/dirty; replay deterministic; append-only patches enforced.

