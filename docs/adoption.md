## Adoption guide (10–15 minutes): use `reason-state` as a memory layer

### Mental model
- Use it like a note logger: **add memories** as your agent runs.
- Before each model call: **retrieve governed context** and inject it into your existing `messages[]`.
- If a fact changes: **`retract()` + `heal()`** (explicit; no hidden recompute). In production you can opt into `mode: "production"` to auto-heal contradictions with rollback fallback.

### 1) Install
```bash
npm install reason-state
```

### 2) Drop into an OpenAI-style `messages[]` loop (copy/paste)
```ts
import { ReasonState } from "reason-state";
import { injectMemoryContext } from "reason-state/integrations/openai";

const rs = new ReasonState({ maxTokens: 2500, mode: "debug" }); // set mode: "production" to auto-heal contradictions

// Write memory (keys optional; recommended when you may retract/update later)
await rs.add("User hates meetings on Friday", { key: "pref:no_friday_meetings" });
await rs.add("Team retro is weekly on Mondays at 10am PT", { key: "schedule:retro" });

const goal = "When should we schedule the retro?";
const messages = [
  { role: "system", content: "You are a helpful assistant." },
  { role: "user", content: goal },
] as const;

// Inject governed memory context (keyless-safe; no LLM required)
const { messages: withMemory, stats } = await injectMemoryContext(rs, [...messages], { goal });

// Now call your model using `withMemory` (OpenAI/Groq/etc.)
// const res = await client.chat.completions.create({ model, messages: withMemory });

console.log("memory stats:", stats);
```

### 3) When facts change (drift control)
```ts
await rs.retract("pref:no_friday_meetings"); // works with stable keys or internal ids
await rs.heal();
```

### 4) Optional: planning mode (LLM required)
If you want `reason-state` to call your model and apply patches:
```ts
const { patches, context } = await rs.plan(goal);
console.log("plan context chars:", context?.length ?? 0, "patches:", patches.length);
```


