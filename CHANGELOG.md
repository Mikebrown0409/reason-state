## 0.5.0 (released)
- Packaging hardened: build emits ESM + d.ts to `dist/src`; `exports/main/types` point to built files; package files limited to built artifacts + docs.
- Build script cleans `dist/` before emit; `test:pkg` builds then validates root/subpath imports.
- Keyless defaults: `demo` runs retrieve-only with canned suggestions when no keys; key-gated `live*` tests auto-skip without GROK/X.
- Docs: API guarantees section and key/command matrix added to `README.md`.
- Optional vector/hybrid retrieval: `vectorStore` hook in `buildContext`/`ReasonStateSimple` with `InMemoryVectorStore` example; default retrieval unchanged.
- HTTP service + Docker: minimal server with `/add`, `/update`, `/query`, `/health`; Docker assets under `apps/server/docker`; compose example.
- Repo hygiene: live tests moved to `tests/live`; README repo layout; broader .gitignore for caches/logs; runtime apps grouped under `apps/`.

## 0.5.1 (released)
- Adoption Turbo: drop-in memory layer ergonomics (`retrieveContext`, `retrieve` with stats, `plan`, `retract` accepts key or id).
- Integrations: OpenAI-style `messages[]` helper `injectMemoryContext` exported under `reason-state/integrations/openai`.
- Docs/examples: new adoption guide (`docs/adoption.md`), concrete execution checklist (`docs/adoption-turbo.md`), runnable examples under `examples/adopt/`.
- Demo: CLI demo now shows the integration-style flow and prints a crisp ROI line (chars/tokens saved + governance counts).
- Tests: added unit coverage for message injection and extended package consumer test to include the new integration output.
- Audit CLI: `reason-state audit <trace.json>` prints ROI lines and emits a Studio-importable `*.reason-state.json` artifact (npx-friendly via `bin`).
- Proof pack: keyless retraction/update benchmark (`npm run bench:proofpack`) + CI-friendly test (`tests/proofpack.test.ts`) and docs (`docs/proof-pack.md`).
- Context safety: retracted/blocked nodes no longer leak stale summaries into LLM context (sanitized in `buildContext` output).
- README/docs: front-door README trimmed for adoption and linked docs pages added (audit CLI, benchmarks, HTTP service, keys/tests, hybrid retrieval).

## 0.5.5 (unreleased)
- Production-ready mode: `mode: "production"` auto-heals contradictions (retract lowest-confidence, retry plan) with rollback fallback; default `mode: "debug"` remains explicit.
- Stats: surface `autoHealAttempts` / `autoHealRolledBack` in plan results for CLI/demo/audit visibility.
- Tests: added deterministic auto-heal coverage (`tests/autoHealMode.test.ts`).
- README: documented the `mode` option and production behavior in the quickstart snippet.

## 0.4.0
- Added append-only log + checkpoints, deterministic context builder modes, governance rules (summaries-only LLM writes), reconciliation improvements.
- Added tooling adapters (Grok/OpenAI-compatible planners), remote storage driver, and examples/smokes for agents.
- Benchmarks and live diagnostics introduced (Grok/X-gated).

## 0.1.x
- Initial hackathon release (append-only log, checkpoints, deterministic context builder, governance core).

