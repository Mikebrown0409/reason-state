## 0.5.0 (released)
- Packaging hardened: build emits ESM + d.ts to `dist/src`; `exports/main/types` point to built files; package files limited to built artifacts + docs.
- Build script cleans `dist/` before emit; `test:pkg` builds then validates root/subpath imports.
- Keyless defaults: `demo` runs retrieve-only with canned suggestions when no keys; key-gated `live*` tests auto-skip without GROK/X.
- Docs: API guarantees section and key/command matrix added to `README.md`.
- Optional vector/hybrid retrieval: `vectorStore` hook in `buildContext`/`ReasonStateSimple` with `InMemoryVectorStore` example; default retrieval unchanged.
- HTTP service + Docker: minimal server with `/add`, `/update`, `/query`, `/health`; Docker assets under `apps/server/docker`; compose example.
- Repo hygiene: live tests moved to `tests/live`; README repo layout; broader .gitignore for caches/logs; runtime apps grouped under `apps/`.

## 0.5.1 (unreleased)
- Adoption Turbo: drop-in memory layer ergonomics (`retrieveContext`, `retrieve` with stats, `plan`, `retract` accepts key or id).
- Integrations: OpenAI-style `messages[]` helper `injectMemoryContext` exported under `reason-state/integrations/openai`.
- Docs/examples: new adoption guide (`docs/adoption.md`), concrete execution checklist (`docs/adoption-turbo.md`), runnable examples under `examples/adopt/`.
- Demo: CLI demo now shows the integration-style flow and prints a crisp ROI line (chars/tokens saved + governance counts).
- Tests: added unit coverage for message injection and extended package consumer test to include the new integration output.

## 0.4.0
- Added append-only log + checkpoints, deterministic context builder modes, governance rules (summaries-only LLM writes), reconciliation improvements.
- Added tooling adapters (Grok/OpenAI-compatible planners), remote storage driver, and examples/smokes for agents.
- Benchmarks and live diagnostics introduced (Grok/X-gated).

## 0.1.x
- Initial hackathon release (append-only log, checkpoints, deterministic context builder, governance core).

