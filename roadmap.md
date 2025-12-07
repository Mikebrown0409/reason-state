roadmap: reason-state hackathon build (10-hour target)
owner: reason-state (Jarvis track) | scope: <1,000 LOC, TS-only

goals
- [ ] ship npm package “reason-state” v0.1.0-hack (TS, ESM+CJS) per spec
- [ ] demo-ready: 45s Jarvis flow (Tokyo→Amsterdam retract; budget 4k↔4.5k)
- [x] constraints: <10 deps (whitelist only), <200 LOC/file, <1,000 LOC total
- [x] pillars: details/summary duality, append-only patches, unknown/assumption lifecycle, self-heal, replay determinism, governed actions, keyword semantic activation (no embeddings)

critical path checklist (progress, no overestimation)
- [x] 0) alignment & skeleton: scope locked, file tree + MIT/license/pkg/tsconfig/vite/README scaffolded.
- [x] 1) state model & types: `src/engine/types.ts` with lifecycles + inline console.asserts.
- [~] 2) patch engine & reconciliation: core functions + validation in place; summary regen still minimal; must add richer tests (budget supersede/prune, contradiction swaps) and a replay determinism proof.
- [x] 3) storage & checkpoints: better-sqlite3 CRUD with in-memory fallback, inline checkpoint asserts.
- [~] 4) adapters & tools: LangGraph gate wired; `xSearch` live via proxy; `mockBooking` blocks/unblocks; must emit live agent plan/patches into state and add explicit dirty/no-op/adapter gating tests.
- [~] 5) demo flow & ui: Time-machine slider + clickable assumptions + diff panel exist but are scripted. Must drive from live agent patch history (X→Grok→booking), show plan text + X counts, and surface blocks/dirty/unknowns visibly.
- [ ] 6) polish, docs, build: README needs final env instructions (.env.example), LangGraph example, demo GIF placeholder, deploy steps, LOC audit, tsc in pipeline; “what’s verified” section (live X/Grok, replay determinism, agent plan/metrics).
- [ ] 7) dry run & verification: pending full live demo run (Tokyo→Amsterdam, budget swing) with metrics validation and replay determinism check.

risk & mitigation
- SDK/env (Grok/X): keys available; must run real calls; add graceful degradation to live public search (no canned data).
- time/LOC creep: enforce <200 LOC/file; no new deps.
- demo flakiness: keep gate on unknowns/dirty; add deterministic fixtures for replay alongside live calls.
- SQLite on Vercel: in-memory fallback ready; add note if persistence needed.

open questions / confirmations
- Grok/X: keys available; must use real calls. ✔
- X rate limits: real API required; no fake data. ✔
- Deployment: needs to impress judges; consider serverless for persistence if time. ◻
- UX/branding: no constraints provided; defaulting to clean Framer/React unless guidance arrives. ◻

win focus (judges)
- Live agent-driven timeline (no scripted patches) with visible state changes (assumptions/unknowns/dirty), plan text, X counts.
- Governance in action: blocked-on-unknown, retract/unblock, contradiction/self-heal event, replay determinism.
- Metrics surfaced (blockedActions, selfHeal interventions, tokens/time saved).

competitiveness note
- Strategy leans on unique uncertainty modeling + self-heal + replay determinism; focused, demoable, light deps. Biggest risks: external SDK availability and time spent on UI polish; mitigate with stubs and minimal but smooth animations.

