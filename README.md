# reason-state

[![npm version](https://img.shields.io/npm/v/reason-state.svg)](https://www.npmjs.com/package/reason-state)
[![tests](https://img.shields.io/badge/tests-101%20passing-brightgreen.svg)]()
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Memory that actually works for AI agents.** Auto-healing, drift-aware, zero-config.

**Up to 81% fewer tokens** on multi-turn agents. Governed context that stays clean.

```ts
import ReasonState from "reason-state";

const memory = new ReasonState();

// Add memories (that's it)
await memory.add("User wants to travel to Tokyo");
await memory.add("Budget is $5000");

// Inject governed context into your agent
const { messages } = await memory.inject(messages, "Plan the trip");
```

No schemas. No embeddings setup. No manual cleanup. **It just works.**

---

## The Problem

Every AI agent needs memory. But memory gets messy:

| Pain Point | What Happens |
|------------|--------------|
| **Contradictions** | User says "Tokyo" then "Amsterdam" — your agent books both |
| **Stale context** | Old facts pollute the prompt, waste tokens, confuse the model |
| **No audit trail** | "Why did the agent do that?" — good luck debugging |
| **Token bloat** | 100 memories → 100k tokens → slow, expensive, truncated |

**reason-state** handles this automatically — but you can always take manual control when needed.

---

## How It Works

```
User: "I want to go to Tokyo"     → memory.add("...")
User: "Actually, Amsterdam"       → memory.add("...")  // Tokyo auto-archived
User: "Wait, back to Tokyo"       → memory.add("...")  // Tokyo reactivated, Amsterdam archived
```

The LLM structures your memories, detects conflicts, and keeps context clean. Auto-heal is the default, not a black box — you can call `retract()`, `heal()`, or `rollback()` manually anytime.

---

## Quick Start

```bash
npm install reason-state
```

### Zero-Config (No API Key)
```ts
import ReasonState from "reason-state";

const memory = new ReasonState();

await memory.add("User prefers morning meetings");
await memory.add("User's timezone is PST");

// Get governed context for your agent
const { context, stats } = await memory.retrieve("Schedule a call");
console.log(context);
// ## Goals/constraints
// - fact: User prefers morning meetings
// - fact: User's timezone is PST
```

### With LLM Structuring (Recommended)
```ts
const memory = new ReasonState({
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-4o-mini",
  maxTokens: 1000,  // optional: context budget (~4k chars), default 1000
});

await memory.add("User wants Tokyo");
await memory.add("Budget is $3000");
await memory.add("Traveling in March");

// Inject into your messages[] — memories are structured, conflicts resolved
const { messages, stats } = await memory.inject(
  [{ role: "user", content: "Book my flight" }],
  "Travel planning"
);

// stats.structuringError, stats.autoHealAttempts, stats.autoHealRolledBack
```

---

## When to Use reason-state

**Great fit:**
- Multi-turn agents with evolving context
- Production agents where you need debugging/audit
- Cost-conscious teams (token budgeting matters)
- Long-lived memory that changes over time
- Self-hosted / OSS preference

**Maybe not the best fit:**
- Quick prototype where you don't care about memory quality
- Single-turn completions (no memory needed)
- Already locked into a managed memory service

---

## Why Developers Love It

### 2-Line Integration
```ts
await memory.add(fact);
const { messages } = await memory.inject(messages, goal);
```
That's your entire memory layer. No setup, no schemas, no maintenance.

### Automatic Drift Control
```ts
await memory.add("User wants Tokyo");
await memory.add("User changed to Amsterdam");  // Tokyo archived automatically
await memory.add("Back to Tokyo please");       // Tokyo reactivated, Amsterdam archived
```
The LLM understands context changes and keeps your memory graph clean.

### Token-Budgeted Context
100 nodes in memory? Only ~20-30 relevant ones go to the LLM.
- Goal-relevant nodes prioritized
- Stale/archived nodes excluded
- Hard budget enforced (no surprise bills)

### Never Breaks Your Agent
```ts
const { messages, stats } = await memory.inject(messages, goal);
// Always returns valid messages, even if:
// - No API key configured
// - LLM call fails
// - Contradictions detected
// - Auto-heal fails → auto-rollback
```
Production-safe. No thrown exceptions. Graceful degradation.

### Full Audit Trail
```ts
console.log(memory.state.history);
// Every change is logged. Replay any point in time.
```

---

## Comparison

| Feature | Prompt stuffing | mem0 / Letta | **reason-state** |
|---------|:--------------:|:------------:|:----------------:|
| Drop-in to `messages[]` | ✅ | ✅ | ✅ |
| No config required | ✅ | ⚠️ | ✅ |
| Token-budgeted context | ❌ | ✅ | ✅ |
| Explicit auto-heal + rollback | ❌ | ❌ | ✅ |
| Deterministic drift handling | ❌ | ⚠️ | ✅ |
| Replay/audit trail | ❌ | ❌ | ✅ |
| Works without API key | ❌ | ❌ | ✅ |

---

## API Reference

### Constructor Options

```ts
const memory = new ReasonState({
  apiKey: "...",      // optional: enables LLM structuring
  model: "gpt-4o-mini", // optional: which model to use
  maxTokens: 1000,    // optional: context budget (default 1000 ≈ 4k chars)
  baseUrl: "...",     // optional: custom API endpoint
});
```

| Option | Default | Description |
|--------|---------|-------------|
| `apiKey` | - | OpenAI-compatible API key. Without it, runs in retrieve-only mode. |
| `model` | `gpt-4o-mini` | Model for LLM structuring calls |
| `maxTokens` | `1000` | Context budget in tokens (~4 chars/token). Controls how much memory is injected. |
| `baseUrl` | OpenAI | Custom endpoint for self-hosted or alternative providers |

### `add(textOrObj)`
Store a memory. No options required.

```ts
await memory.add("User likes coffee");
await memory.add({ preference: "dark roast", source: "survey" });
```

### `inject(messages, goal)`
Inject governed context into your messages array. Returns `{ messages, stats }`.

```ts
const { messages, stats } = await memory.inject(
  [{ role: "user", content: "What should I order?" }],
  "Coffee recommendation"
);
```

**Stats include:**
- `contextChars`, `estTokens` — token usage
- `unknownCount`, `dirtyCount`, `blockedCount` — governance signals
- `structuringError` — LLM structuring failed (fallback used)
- `autoHealAttempts`, `autoHealRolledBack` — heal/rollback activity

### `retrieve(goal)`
Read-only context retrieval. No LLM calls, no mutations.

```ts
const { context, stats } = await memory.retrieve("What are user preferences?");
```

---

## Advanced Usage

### Manual Control (Escape Hatches)

Auto-heal is the default, but you always have manual control:

```ts
import { ReasonStateSimple } from "reason-state";

const memory = new ReasonStateSimple({ mode: "debug" });

// Manual governance when you need it
await memory.retract("node-id");     // Retract a specific memory
await memory.heal();                  // Resolve contradictions manually
await memory.rollback("checkpoint");  // Rollback to a previous state
```

### Production Mode (Auto-heal + Rollback)
```ts
const memory = new ReasonStateSimple({
  apiKey: process.env.OPENAI_API_KEY,
  mode: "production",  // Auto-heals contradictions, rolls back on failure
});
```

### Stable Keys for Updates
```ts
await memory.add("User prefers mornings", { key: "user:pref:time" });
// Later...
await memory.update("user:pref:time", { summary: "User prefers evenings" });
await memory.retract("user:pref:time");
```

### Direct Engine Access
```ts
import { ReasonStateAdvanced } from "reason-state";

const engine = new ReasonStateAdvanced();
engine.applyPatches([{ op: "add", path: "/raw/node1", value: {...} }]);
```

---

## Benchmarks

| Scenario | Nodes | Noise | Token Savings |
|----------|-------|-------|---------------|
| Small (clean) | 20 | 20% | 32% |
| Medium (noisy) | 50 | 50% | 44% |
| Large (noisy) | 100 | 60% | 72% |
| Multi-turn sim | 150 | 65% | **81%** |

Run the benchmark yourself:
```bash
npm test -- tests/tokenSavings.test.ts
```

More benchmarks:
- **Context quality:** Retains required information under truncation (see `docs/benchmarks.md`)
- **Retraction proof:** `docs/proof-pack.md` validates update/retraction correctness

---

## Docs

| Topic | Link |
|-------|------|
| Adoption Guide | [`docs/adoption.md`](docs/adoption.md) |
| Audit CLI | [`docs/audit-cli.md`](docs/audit-cli.md) |
| Benchmarks | [`docs/benchmarks.md`](docs/benchmarks.md) |
| HTTP Service | [`docs/http-service.md`](docs/http-service.md) |
| Hybrid Retrieval | [`docs/hybrid-retrieval.md`](docs/hybrid-retrieval.md) |
| Context Builder | [`docs/context-builder.md`](docs/context-builder.md) |

---

## Try It

### Demo
```bash
npm run demo
```

### Audit Your Traces
```bash
npx reason-state audit path/to/trace.json
```

### Run Tests
```bash
npm test  # 101 tests
```

---

## License

MIT

---

<p align="center">
  <b>Stop wrestling with agent memory. Start shipping.</b>
</p>
