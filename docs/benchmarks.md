## Benchmarks

### Status
Benchmarks are **early** and the primary goal today is **reproducibility + honest methodology** (not cherry-picked leaderboards).

### What we measure
- **Token/cost savings**: governed context size vs “raw dump everything”
- **Update/retraction behavior**: how well the system handles “fact changed” scenarios without prompt bloat
- **Determinism**: rebuild/replay consistency from log/checkpoints

### How to run (current)
- LongMemEval/LoCoMo runner lives under `benchmarks/longmemeval/`.
- Smoke run:
```bash
npm run bench:longmemeval:smoke
```

### Notes
If a benchmark requires keys/models (e.g. Grok), it should be treated as **key-gated** and skipped/fail-loud as documented in the repo’s key policy.


