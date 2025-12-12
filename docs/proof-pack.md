## Proof pack: retraction/update scenarios (keyless)

This is the “holy sh*t” benchmark for memory drift:
- facts change over time
- the system must stop using stale facts
- context must stay bounded (no unbounded prompt bloat)

### Run
```bash
npm run bench:proofpack
```

### What it compares (v1)
- `prompt_append`: naive “append every update to the prompt”
- `kv_latest`: keep only the latest value per key
- `reason_state`: explicit retract + heal + governed retrieval

### The “holy sh*t” table (what you should see)
From a typical run, you’ll see something like:

| Runner | Proxy correctness pass rate | Why it fails/wins |
|---|---:|---|
| `prompt_append` | low | stale facts remain in context after updates |
| `kv_latest` | high | stays clean, but provides no governance/audit/replay |
| `reason_state` | high | retract/heal prevents stale facts leaking into context while keeping an auditable state |

Proxy correctness means: the retrieved context **contains the latest truth** and **excludes retracted facts** (string assertions), without requiring any API keys.

### Output
- `benchmarks/retraction-proofpack/report.md`
- `benchmarks/retraction-proofpack/report.json`

### Why devs care
- This benchmark mirrors real production pain: “we changed the requirement, but the agent keeps using the old one.”
- The goal isn’t “who recalls more trivia,” it’s “who stops lying after updates without prompt bloat.”


