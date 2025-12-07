roadmap: reason-state pivot — JSON-first governed graph (10-hour target)
owner: reason-state (Jarvis track) | scope: <1,000 LOC, TS-only, no new heavy deps

goals
- [ ] ship npm package “reason-state” v0.1.0-hack with structured JSON graph (no graph DB), append-only log + checkpoints
- [ ] demo-ready: 45s Jarvis flow (Tokyo→Amsterdam retract; budget 4k↔4.5k) using real X/Grok + governed booking
- [ ] showcase time-travel/replay UI: guided scenario (Tokyo→retract→Amsterdam) with per-step diffs, reused vs regenerated artifacts, determinism check, token/time savings
- [ ] LLM-driven patching: Grok 4.1 integration with deterministic context builder (summaries-only), system prompt for governance, and validated patch DSL application
- [x] constraints: <10 deps (whitelist only), <200 LOC/file, <1,000 LOC total
- [x] pillars: details/summary split, append-only patches, unknown vs assumption lifecycle, self-heal, replay determinism, governed actions, explicit activation (no embeddings)

critical path checklist (pivoted)
- [x] 0) alignment & skeleton: scaffold done (MIT, pkg, tsconfig, README stub).
- [~] 1) state schema & types: keep JSON, add node schema (fact/assumption/unknown/decision/action/planning), edges (depends_on/contradicts/temporal), lineage fields, timestamps.
- [ ] 2) patch/log/checkpoints: append-only patch log + periodic checkpoints; Zod validation for patch DSL (no delete). Deterministic rebuild/replay tests.
- [ ] 2b) LLM orchestration: Grok 4.1 with system prompt; deterministic context builder (token-budgeted, summaries-only) feeds Grok; apply validated patches with lineage; backoff on invalid patches.
- [ ] 3) reconciliation & governance: dirty propagation via adjacency, contradiction detection, unknown/assumption rules, action gating (unknown/dirty/invalid assumptions), self-heal loop.
- [ ] 4) context builder: deterministic, token-budgeted prompt assembly from summaries (never details), priority buckets (goals/constraints → blockers/unknowns → active plans → top-K facts/assumptions by relevance/recency).
- [ ] 5) tools (real/fallback): `xSearch` must use real X or public fallback (start_time>=2025-12-06); booking becomes real-ish (Stripe-like + calendar clash) and blocks on governance; Grok 4.1 only.
- [ ] 6) agent/orchestrator: JSON-native DAG runner (or LangGraph/Temporal-lite) with nodes: gate → researchX → planWithGrok → bookTravel → selfHeal → replay; checkpoints per turn; reuse artifacts on replay.
- [ ] 7) demo flow & ui: guided scenario UI (Tokyo→retract→Amsterdam) with lineage-rich X posts/media, Grok plan, booking artifact; governance badge (blocked/clean with reasons); time-travel slider with per-step patch log, reused vs regenerated chips, determinism check, and token/time savings; “what the model saw” context snapshot (summaries-only, token-capped).
- [ ] 8) tests: real integration suite (Tokyo→retract→Amsterdam replay) asserts: different hotels, same flights if budget unchanged, token savings >80%, no full reroll; live xSearch + Grok calls; context-builder budget tests; replay determinism.
- [ ] 9) polish/docs/build: README with env + fallback expectations, .env.example, “what’s verified” section, LOC audit, tsc/vitest, demo GIF placeholder.

risk & mitigation
- Real data: enforce real X/Grok; add public-search fallback; fail loud if keys missing.
- Time/LOC: keep JSON-native, no graph DB; reuse existing code where sane; keep files <200 LOC.
- Flakiness: governance gate before actions; watchdog/backoff on invalid patches; checkpoints to recover.
- Demo variance: cache/reuse valid artifacts on replay; log retrieval context for determinism audits.

open questions / confirmations
- Grok/X keys available? else fallback to public X search with start_time filter.
- Booking: acceptable to use Stripe-test + calendar mock as “real-ish”? 
- Deployment target? (local demo vs serverless persistence)
- UX: minimal but must show lineage (sourceType/sourceId) and blockers clearly.

win focus (judges)
- Live, governed, replayable agent (Tokyo→retract→Amsterdam) with real data.
- Governance: blocked on unknown/dirty, self-heal contradictions, replay determinism proof.
- Observability: timeline from log, lineage-rich previews, metrics (blocked actions, self-heal, token savings).

competitiveness note
- Lean JSON-native engine with graph semantics, determinism, and governance; real tools only, no mocks; replay + token-savings story differentiates from naive RAG/agent demos.

