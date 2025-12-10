## Roadmap (canonical)
Owner: reason-state | Scope: JSON-first governed graph; TS-only; <1k LOC; no heavy deps.

### Principles
- Governance-first: append-only patches, no deletes, lineage required, self-heal on contradictions.
- Deterministic: summaries-only context builder, token-budgeted, replay from log+checkpoints.
- Real tools only: Grok 4.1 and real X search; fail loud if unavailable (no mocks).
- Portability: JSON-native, no graph DB; storage driver pluggable (local SQLite/log, remote HTTP).

### Near-term milestone — 0.2.0 “Adoption hardening”
- Packaging: emit built JS+d.ts, update `exports` to `dist/*`, exclude demos from the package, add CHANGELOG.
- API guarantees: document stable surface (`ReasonState`, `planAndAct`, `buildContext`, `facade` helpers) and invariants (append-only, validated patches, deterministic replay).
- Zero-key path: default demos/tests run in retrieve-only mode when keys missing; clearly mark which tests are key-gated.
- Persistence: doc and sample for storage drivers (local SQLite/log paths, remote HTTP driver), plus docker-compose for a tiny HTTP facade.
- Retrieval quality: optional hybrid/embedding hook and ranker in `buildContext`; document pairing with a vector store.
- Replay/governance: finish contradiction self-heal loop, cross-turn `canExecute`, richer statuses; stabilize node shape enums.
- Deterministic replay test: Tokyo→retract→Amsterdam (flights reused, hotels changed; raw+summary match).
- Docs: failure policy (no mocks), env table, “what’s verified” section, GIF/screenshot placeholder.

### Mid-term — Replay + governance completeness
- JSON-native DAG runner (gate → researchX → planWithGrok → bookTravel → selfHeal → replay) with checkpoints per turn and artifact reuse on replay.
- Broader self-heal behaviors and explicit retry/backoff on invalid patches.
- Governance gating assertions in tests (unknown/dirty/invalid assumptions block actions).

### Retrieval quality track
- Pluggable embedding/hybrid retrieval option for larger memories; ranking integration test on LongMemEval/LoCoMo (beyond tiny slices).
- Context-builder tuning: relevance/recency ranker hook, overflow accounting, token-savings assertions.

### Studio (Debugger UI) v1
- Implement the spec: left inputs/governance pill, center timeline carousel with rollback/recompute, right panel tabs (state diff, context, replay log with determinism badge).
- Manual smoke checklist (scrub, rollback, recompute, open tabs) until visuals stabilize; add GIFs/screenshots to README.

### Integrations & examples
- BYO-tools agent example (ReasonState as governed memory only).
- LangGraph/Temporal-lite style example with rollback/replay/unknown handling.
- HTTP facade example + docker-compose for quick try.

### Benchmarks & observability
- Rerun LongMemEval/LoCoMo on meaningful slices (not single-sample), publish token/recall metrics and latency.
- Metrics surfaced in Studio: blocked actions, self-heal events, token savings vs raw.

### Release checklist (use for each cut)
- Package builds and imports clean (dist JS + d.ts; exports tested with ESM+CJS consumers).
- API guarantees documented; breaking changes noted in CHANGELOG.
- Demos/tests: keyless path passes; key-gated suites marked/skipped when keys absent.
- Governance tests green: determinism, replay, contradiction resolution, gating on unknown/dirty/invalid assumptions.
- UI manual smoke done; screenshots/GIF updated.
- Docs updated: env table, failure policy, storage driver guide, integrations links.

