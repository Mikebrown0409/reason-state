# LongMemEval (mini) runner

This is a minimal runner to compare Reason-State vs a naive raw dump on a small LongMemEval-like QA set.

Run (default 4k token budget):
```bash
npm run bench:longmemeval
# or
node benchmarks/longmemeval/runner.ts --dataset=benchmarks/longmemeval/data/longmemeval-mini.json --maxTokens=4000
```

Outputs:
- `benchmarks/longmemeval/results.json` with per-sample results, summary, and maxTokens used.
- Console summary with accuracy and average token counts (tiktoken). Contexts are clipped to `maxTokens`.

Backends:
- reason-state (balanced context, 4k char budget)
- raw dump (full text)

Notes:
- The runner can ingest the official LongMemEval JSON (or a slice) if provided via `--dataset=...`. Place `locomo10.json` (or a subset) in the data folder and pass its path.
- For large datasets, the 4k token budget will force truncation on raw while balanced mode prioritizes salient content.
- Deterministic; no LLM calls are made—coverage is measured by answer substring presence in context. To add live accuracy, wire in your LLM call and scoring.

## Early Grok result (TPM-limited key)
- Dataset: `locomo10.json` (LongMemEval/LoCoMo), first conversation, `maxTokens=800`, `qaLimit=3`
- Model: `grok-4-1-fast-non-reasoning`
- Result (LLM F1/tokens):
  - reason-state: F1≈0.095, tokens≈907
  - raw: F1≈0.0175, tokens≈7221
- Token reduction: ~8×; F1 lift: ~5.4×
- Footnote: small slice due to 12k TPM key; full run planned when higher quota is available. Code/config: this runner + flags above.

