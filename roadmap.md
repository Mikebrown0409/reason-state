## Roadmap (canonical)
Owner: reason-state | Scope: JSON-first governed graph + governed memory layer + debugger tooling. TS-only; keep deps light; prioritize determinism + adoption.

### Principles (non-negotiable)
- Governance-first: append-only patches, no deletes, lineage required, contradictions trigger self-heal/reconciliation.
- Deterministic: summaries-only context builder, token-budgeted, replay from log+checkpoints.
- Tool realism: if real X/Grok aren’t available, fail loud for those tests (no mocks), but keep a keyless path for core demos/tests.
- Portability: JSON-native (no graph DB required); storage driver pluggable (local + remote).

### Where we are now (shipped)
- NPM packaging hardened: built ESM + `.d.ts`, exports wired to `dist/`, consumer test exists.
- Keyless-first: demos/tests run without keys (retrieve-only path).
- Minimal HTTP service exists + docker assets under `apps/server/docker/`.
- Studio exists (experimental) and already demonstrates import + timeline + context view + diffs.
- “Boring memory layer” API is real:
  - `add()` (keys optional; stable keys supported)
  - `retrieveContext()` / `retrieve()` (no LLM)
  - `retract()` / `heal()` / `rollback()`
  - `plan()` (LLM path)

### Strategy: two-lane product (to avoid slow adoption)
- Lane A — **Drop-in memory layer (mass adoption)**:
  - Make it a 10–15 minute integration into existing agent loops.
  - Make ROI undeniable on first run (token/cost stats + “fixed drift” story).
- Lane B — **Governance + replay + debugger (moat)**:
  - Deterministic replay, auditability, time-travel, contradiction tooling.
  - Studio becomes the DevTools / conversion funnel.

### Next milestone — “Adoption Turbo” (v0.5.x)
- Integrations:
  - OpenAI-style `messages[]` middleware/helper to inject governed context (copy/paste into any agent).
  - “Bring your own agent” examples: Node loop + Next.js route + LangGraph/LangChain adapters.
  - Lightweight import/adapters for common traces/logs (tool calls, message arrays) for instant value.
- Proof/ROI:
  - `retrieve()` stats standardized (token estimate, counts) and used in CLI demo + README “5 second win” section.
  - Add a minimal “audit” CLI (`npx reason-state audit <trace.json>`) that prints ROI and emits a Studio-friendly file.
- Docs (front door):
  - README becomes 2 sections: “Drop-in memory layer” first, “Governance/advanced” second.
  - A single “Adoption guide” doc with copy/paste snippets for common stacks.

### Mid-term — “Governed agent runtime” (v0.6.x)
- Replay + governance completeness:
  - Deterministic rebuild from log+checkpoint (tight tests, stable ordering).
  - Stronger governance gating (`unknown`/`dirty`/invalid assumptions block actions) surfaced as first-class developer output.
  - Expanded self-heal behaviors + explicit retry/backoff policy for invalid patches.
- Studio as DevTools:
  - “Why was this in context?” lineage/explanation view.
  - One-click retract/rollback + visible deltas in context + state.
  - Import + share: generate a reproducible artifact from any run and open it in Studio.

### Retrieval quality track (ongoing)
- Keep rule-based context selection as default; optional hybrid/vector hook.
- Publish tests that show improvements on update/retract tasks (not just recall).
- Context-builder tuning: relevance/recency hooks, overflow accounting, token-savings assertions.

### Benchmarks & credibility (ongoing)
- Re-run LongMemEval/LoCoMo on meaningful slices (not single-sample); publish token/recall + drift/update performance.
- Add a “retraction/update” focused benchmark because that’s the differentiator.

### Release checklist (use for each cut)
- Package builds and imports clean (dist JS + d.ts; ESM+CJS consumers).
- Demos/tests: keyless path passes; key-gated suites marked/skipped when keys absent.
- Governance tests green: determinism, replay, contradiction resolution, gating on unknown/dirty/invalid assumptions.
- Studio manual smoke done; screenshots/GIF updated.
- Docs updated: adoption guide, env table, failure policy, storage driver guide, integrations links.

