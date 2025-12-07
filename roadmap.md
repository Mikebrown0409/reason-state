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
- [~] 2) patch engine & reconciliation: core functions implemented; needs stronger validation, richer summary regen, and explicit tests for budget supersede/prune + contradiction swap coverage.
- [x] 3) storage & checkpoints: better-sqlite3 CRUD with in-memory fallback, inline checkpoint asserts.
- [~] 4) adapters & tools: LangGraph gate wired; `xSearch` hits Grok/X; `mockBooking` blocks on unknowns; still need explicit tests for dirty no-op and booking unblock.
- [~] 5) demo flow & ui: DemoApp flow stubbed (Tokyo→Amsterdam + budget tweaks), Timeline with Framer, cards present; missing live X previews, metrics logging, confetti, and full 45s polish.
- [ ] 6) polish, docs, build: README partially updated; still need demo GIF placeholder, LangGraph example, deploy steps, LOC audit, tsc run in pipeline.
- [ ] 7) dry run & verification: pending full demo run, metrics validation, replay determinism check.

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

