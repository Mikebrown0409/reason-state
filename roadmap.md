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
- [~] 2) patch engine & reconciliation: core functions + validation in place; summary regen still minimal; tests exist via console.assert but need richer coverage for budget supersede/prune and contradiction swaps.
- [x] 3) storage & checkpoints: better-sqlite3 CRUD with in-memory fallback, inline checkpoint asserts.
- [~] 4) adapters & tools: LangGraph gate wired; `xSearch` now working via proxy with `start_time`; `mockBooking` blocks/unblocks; some asserts added—still want explicit dirty no-op/adapter gating tests.
- [~] 5) demo flow & ui: Demo flow running with live X previews, metrics log, confetti, Framer timeline; still need 45s polish (animations/voice stub) and full E2E click-through.
- [ ] 6) polish, docs, build: README needs final env instructions (.env.example), LangGraph example, demo GIF placeholder, deploy steps, LOC audit, tsc in pipeline.
- [ ] 7) dry run & verification: pending full demo run (Tokyo→Amsterdam, budget swing), metrics validation, replay determinism check.

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

competitiveness note
- Strategy leans on unique uncertainty modeling + self-heal + replay determinism; focused, demoable, light deps. Biggest risks: external SDK availability and time spent on UI polish; mitigate with stubs and minimal but smooth animations.

