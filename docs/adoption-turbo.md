## Adoption Turbo (v0.5.x) — Implementation checklist (concrete)
Goal: make `reason-state` a **10–15 minute drop-in memory layer** for existing agents, with **immediate ROI proof** (token/cost savings + drift control), while keeping governance/engine power available but out of the happy path.

### Success criteria (what “winning” looks like)
- A new user can:
  - install the package
  - add 3–5 memories
  - inject governed context into their existing OpenAI-style message loop
  - see clear stats (`estTokens`, `contextChars`, `unknown/dirty/blocked`) and a “saved X%” line
  - all without needing to understand patches, replay, or node graphs
- The README front door shows the above in < 60 seconds of reading.
- Minimal examples cover 3 common stacks (Node loop, Next.js route, LangChain/LangGraph).

---

## Lane A (mass adoption): “Drop-in memory layer”

### A1) OpenAI-style middleware helper (the one-copy/paste integration)
**Deliverable**
- New helper that takes OpenAI-style `messages[]` and injects governed memory context.

**Proposed API**
- File: `src/integrations/openaiMessages.ts`
- Export path: `reason-state/integrations/openai` (add subpath export)

```ts
// Proposed types (OpenAI-style, minimal)
export type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content: string };

export type InjectOptions = {
  goal: string;
  /** Where to inject memory context */
  strategy?: "system" | "prepend-user";
  /** Optional label for the injected section */
  heading?: string;
};

export async function injectMemoryContext(
  rs: { retrieve: (goal: string) => Promise<{ context: string; stats: any }> },
  messages: ChatMessage[],
  opts: InjectOptions
): Promise<{ messages: ChatMessage[]; stats: any }> {}
```

**Acceptance**
- Works with plain OpenAI SDK style loops (no framework).
- Does not require keys.
- Does not change existing message content beyond injecting a single additional message or prefix.
**Status**
- Shipped: `src/integrations/openaiMessages.ts` + export `reason-state/integrations/openai`

---

### A2) “Adoption guide” doc (copy/paste into real agent loops)
**Deliverable**
- A single “how to adopt” doc that is not engine-y.

**File**
- `docs/adoption.md`

**Contents**
- Minimal Node agent loop example:
  - `rs.add()` calls for user/tool memory
  - `injectMemoryContext()` or `retrieveContext()` usage
  - show stats printing
- Next.js route / server action example
- “Keys optional; keys recommended when you plan to retract/update”
- “If a fact changes: `retract()` + `heal()`”

**Acceptance**
- A developer can copy/paste any one example and run it with minimal edits.
**Status**
- Shipped: `docs/adoption.md`

---

### A3) Examples directory (3 stacks)
**Deliverable**
- Runnable examples that match how people actually write agents.

**Files**
- `examples/adopt/node-openai-loop.ts`
- `examples/adopt/nextjs-route.ts`
- `examples/adopt/langgraph.ts` (or `langchain.ts` if that’s the target)

**Acceptance**
- Each example:
  - runs keyless in retrieve-only mode
  - prints memory stats
  - clearly shows “where memory context goes”
**Status**
- Shipped: `examples/adopt/*`

---

### A4) Make ROI undeniable in 5 seconds
**Deliverable**
- Standard “ROI line” printed by demo/audit:
  - `contextChars`, `estTokens`, counts, and a savings comparison baseline.

**Implementation**
- Use `rs.retrieve(goal)` (already exists) as the canonical stats source.

**Acceptance**
- CLI demo prints a deterministic, copy-pastable summary line like:
  - `memory: 173 chars (~44 tok), raw: 418 chars (~105 tok), saved ~58% | unknown=0 dirty=1 blocked=1`
**Status**
- Shipped: CLI demo prints ROI line + README quickstart prints `stats`

---

## Lane A (mass adoption): “Bring-your-own logs” audit → Studio

### A5) `npx reason-state audit <trace.json>`
**Deliverable**
- A CLI that ingests a common trace format and outputs:
  - printed ROI summary
  - an artifact file that Studio can load

**Files**
- `apps/audit/cli.ts` (new)
- `apps/audit/adapters/*` (new)
- `package.json` bin entry (e.g. `"bin": { "reason-state": "dist/audit/cli.js" }`) or `tsx`-based dev runner

**Adapters (minimum)**
- OpenAI-style: `{ messages: [...] }`
- Anthropic-ish: `{ messages: [...] }`
- Generic: array of `{ role, content }`

**Acceptance**
- Running `npx reason-state audit trace.json` produces:
  - terminal output with ROI metrics
  - `trace.reason-state.json` (or similar) importable in Studio
**Status**
- Not yet (next slice)

---

## Lane B (moat): Governance + DevTools

### B1) “Why was this in context?” explanation
**Deliverable**
- Studio view shows:
  - which nodes were selected into context
  - why (priority bucket, recency/relevance, vector hit)
  - lineage (`sourceType/sourceId`)

**Files**
- `apps/studio/src/components/RightPanel.tsx`
- `src/context/contextBuilder.ts` (expose selection metadata in an optional debug return mode)

**Acceptance**
- In Studio, clicking a step shows a list of selected nodes with explanation fields.

---

### B2) One-click retract/rollback that feels “real”
**Deliverable**
- Studio actions apply real patches + show resulting context diff immediately.

**Acceptance**
- Clicking retract:
  - marks the right node blocked/dirty
  - context changes (and stats update)

---

## Packaging / DX glue (must-haves to support adoption)

### P1) Subpath exports for integrations
**Deliverable**
- Export `reason-state/integrations/openai` (and any other adapters) via `package.json` `exports`.

**Acceptance**
- Works in ESM+CJS consumer tests (extend `tests/pkg-consume.test.ts`).

---

### P2) README front door (short and boring)
**Deliverable**
- README top section:
  - 20-line drop-in example (add → retrieveContext → inject)
  - ROI line
  - “keys optional, recommended for retract/update”
  - link to `docs/adoption.md`

---

## Order of operations (recommended)
1) A1 middleware helper
2) A2 adoption doc + A3 examples
3) A4 ROI line in CLI demo
4) A5 audit CLI → Studio artifact
5) B1/B2 devtools upgrades
6) P1/P2 packaging/docs polish


