roadmap: reason-state pivot — JSON-first governed graph (10-hour target)
owner: reason-state (Jarvis track) | scope: <1,000 LOC, TS-only, no new heavy deps

goals
- [~] ship npm package “reason-state” v0.1.0-hack with structured JSON graph (no graph DB), append-only log + checkpoints (history + replay + Zod patch validation + checkpoint save/restore + log writer + auto-checkpointing landed; log replay helper added; finalize packaging still pending)
- [ ] demo-ready: 45s Jarvis flow (Tokyo→Amsterdam retract; budget 4k↔4.5k) using real X/Grok + governed booking
- [ ] showcase time-travel/replay UI: guided scenario (Tokyo→retract→Amsterdam) with per-step diffs, reused vs regenerated artifacts, determinism check, token/time savings
- [~] LLM-driven patching: Grok 4.1 with deterministic context builder (summaries-only), strict system prompt with good/bad few-shot, summary-only patch path (LLM cannot write /raw), validated parse/backoff, engine-assigned IDs, node-shape validation/tests landed; multi-turn planning added with per-turn meta; remaining: governance coverage across turns and deeper live integration
- [x] constraints: <10 deps (whitelist only), <200 LOC/file, <1,000 LOC total
- [x] pillars: details/summary split, append-only patches, unknown vs assumption lifecycle, self-heal, replay determinism, governed actions, explicit activation (no embeddings)

critical path checklist (pivoted)
- [x] 0) alignment & skeleton: scaffold done (MIT, pkg, tsconfig, README stub).
- [~] 1) state schema & types: JSON model with fact/assumption/unknown/action/planning and lineage fields landed; edges (depends_on/contradicts/temporal), timestamps, richer status enums still pending.
- [x] 2) patch/log/checkpoints: append-only history + Zod patch validation (no delete) + replay + save/restore checkpoint + auto-checkpoint interval + log writer + log replay helper done; next: package publish wiring.
- [~] 2b) LLM orchestration: Grok 4.1 with strict prompt + few-shot; deterministic context builder (token-budgeted, summaries-only) feeds Grok; parse/validate/backoff of model patches; engine assigns IDs; /raw blocked for LLM; node-shape validation/tests done; multi-turn planning with meta logging added; simple + X agent smokes running. Remaining: governance interplay across turns in more complex flows and broader live integration coverage.
- [~] 3) reconciliation & governance: dirty propagation via adjacency + contradiction edges; depends_on + temporal_after/temporal_before blocking/unblocking; contradiction sets resolved by recency (newest wins, others blocked/dirty); canExecute gates unknown/dirty/invalid assumptions; timestamps on nodes. Remaining: richer adjacency/timestamps usage and broader self-heal behaviors.
- [x] 4) context builder: deterministic, token-budgeted prompt assembly from summaries (never details), priority buckets configurable; budget/truncation/topK determinism tests added. (Relevance/recency tuning beyond id-sort remains optional polish.)
- [~] 5) tools (real only): `xSearch` uses real X (fail loud); booking real-ish (Stripe-test + calendar clash + governance gate); Grok 4.1 only; simple/X agent smokes green; remaining: full live-agent run with X + governance DAG and persisted log.
- [ ] 6) agent/orchestrator: JSON-native DAG runner (or LangGraph/Temporal-lite) with nodes: gate → researchX → planWithGrok → bookTravel → selfHeal → replay; checkpoints per turn; reuse artifacts on replay.
- [ ] 7) demo flow & ui: guided scenario UI (Tokyo→retract→Amsterdam) with lineage-rich X posts/media, Grok plan, booking artifact; governance badge (blocked/clean with reasons); time-travel slider with per-step patch log, reused vs regenerated chips, determinism check, and token/time savings; “what the model saw” context snapshot (summaries-only, token-capped).
- [~] 8) tests: determinism + Grok validation + node-shape validation + context-builder budget/determinism + reconciliation edges/timestamps (depends_on/temporal_before) + simple/X agent smokes added; integration replay harness added (simple agent, log replay, booking blocked). Still need full integration suite (Tokyo→retract→Amsterdam replay with hotel/flight assertions), governance gating assertions, token-savings assertions.
- [~] 9) polish/docs/build: README env + .env.example + “what’s verified” section and strict system prompt doc updated; still need demo GIF placeholder, LOC audit, build/publish path, and tool fallback notes.

risk & mitigation
- Real data: enforce real X/Grok; no fallback; fail loud if keys missing.
- Time/LOC: keep JSON-native, no graph DB; reuse existing code where sane; keep files <200 LOC.
- Flakiness: governance gate before actions; watchdog/backoff on invalid patches; checkpoints to recover.
- Demo variance: cache/reuse valid artifacts on replay; log retrieval context for determinism audits.

open questions / confirmations
- Grok/X keys available? (no fallback; fail loud)
- Booking: acceptable to use Stripe-test + calendar mock as “real-ish”?
- Deployment target? (local demo vs serverless persistence)
- UX: minimal but must show lineage (sourceType/sourceId) and blockers clearly.

win focus (judges)
- Live, governed, replayable agent (Tokyo→retract→Amsterdam) with real data.
- Governance: blocked on unknown/dirty, self-heal contradictions, replay determinism proof.
- Observability: timeline from log, lineage-rich previews, metrics (blocked actions, self-heal, token savings).

competitiveness note
- Lean JSON-native engine with graph semantics, determinism, and governance; real tools only, no mocks; replay + token-savings story differentiates from naive RAG/agent demos.

