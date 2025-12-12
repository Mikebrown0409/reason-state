## reason-state

Governed long-term memory for agents. Summaries-only context, token-budgeted, replayable. **Drop in one object**, keep governance **explicit** (`retract()`, `heal()`, `rollback()`), and run **keyless** in retrieve-only mode.

**Use it like a note-taking logger:** add facts → retrieve governed context. If you need to update/retract later, give that fact a stable `key` (optional).

## Try it in 60 seconds
```bash
npm install reason-state
```

### Drop into any OpenAI-style `messages[]` loop
```ts
import { ReasonState } from "reason-state";
import { injectMemoryContext } from "reason-state/integrations/openai";

const rs = new ReasonState({
  apiKey: process.env.OPENAI_API_KEY, // optional
  model: "gpt-4o-mini",               // optional
  maxTokens: 2500,                    // ~10k chars budget
});

// Zero-friction: just add text (we generate an id)
await rs.add("User hates meetings on Friday");

// Recommended for anything you may update/retract later: provide a stable key.
await rs.add("User hates meetings on Friday", { key: "user:pref:no_friday_meetings", type: "fact" });

const goal = "When should we schedule the retro?";
const messages = [{ role: "user", content: goal }];

// Keyless-safe retrieve-only (no LLM): inject governed context into your messages[]
const { messages: withMemory, stats } = await injectMemoryContext(rs, messages, { goal });
// Pass `withMemory` to your model call.
console.log("ROI stats:", stats);

// Plan (default): builds context, calls your model, applies patches (requires a key)
const { patches } = await rs.plan(goal);

// Explicit governance (no hidden recompute)
await rs.retract("user:pref:no_friday_meetings"); // retract by stable key (blocked + dirty)
await rs.heal();                           // resolves contradictions + reconciles
await rs.rollback("subtree-root-node-id"); // subtree rollback (optional)
```

### Try it with your own logs (no code)
```bash
npx reason-state audit path/to/trace.json
# writes: path/to/trace.reason-state.json (Studio-importable)
```

## Demo (1 command)
```bash
npm run demo
```
CLI demo: ingests a few facts, shows balanced retrieval-only context, and if an API key is present runs one planner turn. Works without keys (planner step skipped).

## Why teams adopt it
- **Lower cost / smaller prompts**: governed, token-budgeted context with measurable ROI (`stats`).
- **Drift control**: retract + heal when facts change (no prompt spaghetti).
- **Debuggable memory**: deterministic replay + explicit governance signals (unknown/dirty/blocked).

## How it compares (high level)
| Capability | Prompt hacking | mem0/Letta-style memory | reason-state |
|---|---:|---:|---:|
| Drop-in to `messages[]` | ✅ | ✅ | ✅ |
| Keyless try-now path | ✅ | ✅ | ✅ |
| Token-budgeted context | ⚠️ | ✅ | ✅ |
| Retraction + heal as first-class | ❌ | ⚠️ | ✅ |
| Deterministic replay/audit | ❌ | ⚠️ | ✅ |

## Benchmarks
- Benchmarks + methodology: `docs/benchmarks.md`

## Docs (short links)
- Adoption guide: `docs/adoption.md`
- Audit CLI (`npx reason-state audit ...`): `docs/audit-cli.md`
- HTTP service: `docs/http-service.md`
- Keys/tests matrix: `docs/keys-and-tests.md`
- Hybrid retrieval (optional vector hook): `docs/hybrid-retrieval.md`
- Studio: `docs/ui-studio.md`
- Context builder reference: `docs/context-builder.md`
- System prompt reference: `docs/system-prompt.md`

## Advanced imports
- Advanced engine: `import { ReasonStateAdvanced } from \"reason-state/engine\"`

