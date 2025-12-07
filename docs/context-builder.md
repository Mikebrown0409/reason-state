# Context Builder & Patch DSL

## Context builder
- Deterministic ordering (stable across runs) with token budget.
- Inputs: summaries only (no raw details).
- Priority buckets:
  1) Goals/constraints
  2) Blockers: unknowns, dirty nodes, invalid assumptions
  3) Active plans
  4) Top-K facts/assumptions by relevance/recency
  5) Minimal timeline (compact)
- Include lineage when present: `sourceType/sourceId`.
- Model target: Grok 4.1 (`grok-4-1-fast-reasoning-latest`).

## Patch DSL (validated)
Allowed ops:
- `updateSummary`
- `setStatus`
- `addChildNode`
- `linkNodes`
- `createUnknownNode`
- `resolveUnknown`
- `promoteToParent`
- `mergeNodes`

Constraints:
- No deletes.
- IDs must exist except when creating.
- Summaries must not invent data absent in details.
- Must preserve lineage (`sourceType/sourceId`) on Grok/X/tool-derived nodes.
- Structural changes must mark affected nodes dirty; reconciliation clears dirty after regen.

## Application & log
- Patches appended to log; checkpoints taken periodically.
- applyPatches validates DSL, updates state, marks touched nodes dirty, resyncs unknowns/assumptions.
- Reconciliation/self-heal handles contradictions and clears dirty flags after summary regen.

## Determinism
- Context builder + ordered patches + checkpoints must enable deterministic replay.
- If tools/LLM unavailable, fail loud; do not emit fake data.

