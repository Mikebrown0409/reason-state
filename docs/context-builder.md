# Context Builder & Patch DSL

## Context builder
- Deterministic ordering (stable across runs) with hard `maxChars` budget.
- Inputs: summaries only (no raw details).
- Modes:
  - Deterministic: fixed bucket ordering + truncation.
  - Balanced/Aggressive: adaptive fill by characters; always keeps blockers (unknown/dirty/invalid assumptions), goal/dep chain, recent changes, then fills per-bucket caps that scale with remaining budget and emits overflow one-liners instead of dropping silently.
- Timeline: appended only if space remains; tail trimmed by `timelineTail`.
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

