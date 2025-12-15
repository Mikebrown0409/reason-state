# API Simplification & Core Features Tracking

This doc is the **single source of truth** for the new front‑door API and behavior. We’ll implement it in order as a checklist.

---

## 1. Goals

- [x] **2-call UX**: devs only ever need `add()` + `inject()` (Mem0/Letta style).
- [x] **Zero config**: no keys, no types, no edges, no parentId, no heal/rollback calls in app code.
- [x] **Governed memory**: unknowns/assumptions/decisions, contradictions, dirty/blocked, `canExecute` remain first‑class.
- [x] **Drift control**: retract/heal/rollback happen automatically under the hood.
- [x] **Determinism/audit**: logs + checkpoints + replay remain intact.

---

## 2. Front-door API (what devs actually use)

### 2.1 `add(textOrObj)`

- [x] **Zero options** – only argument is `textOrObj` (string or JSON‑ish object).
- [x] **Simple storage** – no LLM call, no structuring at `add()` time.
- [x] **Auto-key generation** – internal id is content‑hash (+ uuid if needed) so exact duplicates upsert, not duplicate.
- [x] **Store raw node** – `type` may default (e.g., provisional `fact`), but true type/edges may be refined later during structuring.

Usage (dev):
```ts
await rs.add("User hates Friday meetings");
```

### 2.2 `inject(messages, goal)`

- [x] **Automatic structuring**
  - If there are unstructured/dirty nodes from `add()`, `inject()`:
    - [x] Calls LLM **once per inject** to:
      - classify type (fact / assumption / unknown / planning)
      - propose/adjust edges (depends_on, contradicts, temporal, parent/child)
      - propose retractions/archives (drift control)
    - [x] Applies returned patches via existing engine (validated patch DSL).

- [x] **Batched LLM calls**
  - All unstructured nodes since last structuring are handled in a single LLM call per `inject()`, not per `add()`.

- [x] **Auto-heal + rollback (invisible)**
  - [x] After structuring, run auto‑heal on contradictions.
  - [x] If heal fails after max attempts, auto‑rollback to last good checkpoint.
  - [x] Never throw – always return safe `{ messages, stats }`.
  - [x] Expose `autoHealAttempts`, `autoHealRolledBack` in `stats` for optional gating.

- [x] **Edge creation + validation**
  - [x] LLM proposes edges (depends_on, contradicts, temporal, parent/child).
  - [x] Engine validates patches structurally (already present).
  - [x] Add a post‑LLM **edge validation pass** to catch obviously bad edges.
  - [x] Improve system prompt so LLM uses the patch DSL correctly and consistently.

- [x] **Retraction / archival / reactivation**
  - [x] LLM detects conflicts (e.g., Amsterdam vs Tokyo) and issues retraction/archival patches.
  - [x] Introduce explicit notion of **archived** vs **blocked**:
    - archived: temporarily irrelevant but not wrong
    - blocked: contradicted/invalid
  - [x] When user context reverts (e.g., back to Tokyo), LLM can emit patches to reactivate archived nodes and archive the others.
  - [x] Dev never calls `retract()` in the front‑door path – all retraction/reactivation is via `inject()`.

- [x] **Token-budgeted, prioritized context** (LLM‑facing)
  - [x] Use existing `buildContext()` with:
    - blockers → goal chain → recent → high‑confidence → facts/assumptions → actions/other
    - hard `maxChars` budget (~10k tokens)
  - [x] Improve **workflow-step awareness**:
    - given `goal` and current graph, only include nodes relevant to current step/goal where possible.
    - Implemented via bidirectional `collectDepsForGoal` + `goalRelevanceScore` + tighter section caps.
  - [x] `inject()` returns `{ messages, stats }`, where `messages` has a prepended governed memory context (via existing `injectMemoryContext`).

- [x] **No-key / no-model fallback**
  - [x] If no API key/model is configured, `inject()` **must still work**:
    - behaves like today’s `retrieve()` + `injectMemoryContext`
    - no structuring, no auto‑heal/rollback, but still governed, token‑budgeted context + stats.
  - [x] If LLM call fails, fallback is:
    - keep previous structured state + new raw nodes as unstructured
    - still build context deterministically
    - surface failure in `stats` (e.g., `structuringError: true`).

Usage (dev):
```ts
// Dev does this (2 lines):
await rs.add("User hates Friday meetings");
const { messages, stats } = await rs.inject(messages, "When is the retro?");
```

### 2.3 Optional: `retrieve(goal)` (read-only)

- [x] Read-only, no LLM, no structuring, no auto‑heal.
- [x] Returns `{ context, stats }` using `buildContext()`.
- [x] Used when dev wants context only (e.g., offline analysis, debugging, or zero‑key deployments).

---

## 3. Token Efficiency (100 nodes → ~20–30 active)

**Current:**
- Context builder:
  - [x] Prioritizes blockers → goal chain → recent → high‑confidence → facts/assumptions.
  - [x] Uses `depChain` to collect dependencies for goal.

**Implemented:**
- [x] **Workflow-step-aware filtering** – only include nodes relevant to the active goal/step.
  - `goalId` is matched from goal text and passed to `buildContext()`.
- [x] **Goal-chain optimization** – improve `collectDepsForGoal` to better reflect relevant subtrees.
  - Bidirectional traversal: finds what goal depends on (upstream) AND what depends on goal (downstream).
  - Includes parent/child relationships.
  - Depth-limited (max 3 hops) to prevent explosion.
- [x] **Relevance scoring** – refine ranking (typeWeight + recency + confidence) so ~20–30 nodes dominate for large graphs.
  - Added `goalRelevanceScore()` that boosts nodes in dependency chain, siblings, and related nodes.
  - Tightened section caps (maxCap: 10-15 per section vs. 30-50 before).
- [x] Keep hard `maxChars` budget and overflow indicators ("... (N more facts)").

---

## 4. Retraction / Archival / Reactivation

**Current:**
- [x] `retract()` marks nodes `blocked + dirty` and propagates via reconciliation.
- [x] Retracted/blocked nodes show as `(retracted)` in summaries but remain in state for audit.
- [x] Explicit "archived" vs "blocked" distinction added to `NodeStatus`.
- [x] Automatic reactivation when user reverts context (LLM-driven via structuring).

**Needed (in `inject()`):**
- [x] LLM-driven detection of contradictory or superseded facts; emit retraction/archival patches.
- [x] Add explicit **archived** status to `StateNode` semantics (can reuse status or add metadata flag).
- [x] When user changes context back (e.g., Tokyo ↔ Amsterdam ↔ Tokyo), LLM can reactivate archived nodes and archive current ones.
- [x] All of the above is automatic inside `inject()`; front-door devs never call `retract()` manually.

---

## 5. Deduplication

**Current:**
- [x] Key-based upsert via `put()/updateKey()` (wrapper level).
- [ ] No content-based or similarity-based dedupe in engine.

**Needed (front-door behavior):**
- [x] **Content-hash IDs** in front-door `add()` for exact duplicates (same content → same internal id → upsert, not duplicate).
- [ ] Optional **similarity-based merge** during structuring in `inject()` (LLM can merge near-dupes via patch DSL).
- [ ] Ensure dedupe maintains lineage (`sourceType/sourceId`) for audit.

---

## 6. Edge Creation & Validation

**Current:**
- [x] LLM in `plan()` (advanced path) can create edges via patches.
- [x] Patches validated structurally by engine.
- [ ] No semantic validation of edges.

**Needed (in `inject()` front door):**
- [x] LLM infers edges automatically – dev never specifies edges.
- [x] Post‑LLM validation pass for edges (e.g., sanity checks on graph structure, no impossible cycles if disallowed, etc.).
- [x] Stronger system prompts aligned with `docs/system-prompt.md` and patch DSL.

---

## 7. Auto-heal & Rollback

**Current (production mode):**
- [x] Auto-heal on contradictions.
- [x] Rollback if heal fails after max attempts.
- [x] Rollback visibility and gating not fully surfaced in front-door API.

**Needed (in `inject()`):**
- [x] Auto-heal always runs after structuring; dev never calls `heal()`.
- [x] Rollback is invisible in behavior (still returns messages), but stats include `autoHealRolledBack: true`.
- [x] Never throw or break agent loops due to heal/rollback; always return safe `{ messages, stats }`.

---

## 8. Implementation Notes & Order

### Constraints
- [x] **Front door only**: `add()` and `inject()` (optional: `retrieve()` read-only).
- [x] No new top-level functions in front-door API.
- [x] Keep existing `ReasonStateSimple` / engine APIs (`plan`, `retract`, `heal`, `rollback`, `facade`) as **advanced**.

### Suggested implementation order
1. ~~**Front-door wrapper skeleton**: new facade exposing only `add()` + `inject()` (and `retrieve()`), delegating to existing engine.~~ ✅
2. ~~**Content-hash IDs & basic dedupe** in `add()` (front door only).~~ ✅
3. ~~**Inject-time structuring stub**: plumb an LLM call that returns no-op patches but wires through the flow (for testing).~~ ✅
4. ~~**Auto-heal/rollback integration** in `inject()` using existing production-mode logic.~~ ✅
5. ~~**Edge creation + validation** via LLM patches + validation pass.~~ ✅
6. ~~**Retraction/archival/reactivation** semantics and patches.~~ ✅
7. ~~**Token efficiency tuning** (workflow-step-aware context building).~~ ✅
8. ~~**Error handling & no-key fallback** (no model → retrieve-only behavior).~~ ✅

This document should stay in sync with implementation; update checkboxes and notes as features land.