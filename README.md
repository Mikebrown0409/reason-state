# reason-state

**Memory that actually works for AI agents.** Auto-healing, drift-aware, zero-config.

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

**reason-state** solves all of this automatically.

---

## How It Works

```
User: "I want to go to Tokyo"     → memory.add("...")
User: "Actually, Amsterdam"       → memory.add("...")  // Tokyo auto-archived
User: "Wait, back to Tokyo"       → memory.add("...")  // Tokyo reactivated, Amsterdam archived
```

The LLM structures your memories, detects conflicts, and keeps context clean. You never call `retract()`, `heal()`, or `rollback()` — it's all invisible.

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
| Auto-heal contradictions | ❌ | ❌ | ✅ |
| Drift control (archive/reactivate) | ❌ | ⚠️ | ✅ |
| Deterministic replay/audit | ❌ | ❌ | ✅ |
| Works without API key | ❌ | ❌ | ✅ |

---

## API Reference

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

### Production Mode (Auto-heal + Rollback)
```ts
import { ReasonStateSimple } from "reason-state";

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
npm test
```

---

## License

MIT

---

<p align="center">
  <b>Stop wrestling with agent memory. Start shipping.</b>
</p>
