# System Prompt & Governance (Grok 4.1)

## Purpose
- Enforce governance: no deletes, lineage required, unknown/dirty block actions, contradictions trigger self-heal.
- Keep LLM on summaries-only context; never mutate `details`.
- Produce only validated patch DSL that the engine can apply.

## Prompt skeleton (strict)
```
You are Reason-State reconciliation. Governed JSON graph, append-only patches, no deletes.
Rules (must follow exactly):
- You may ONLY write to `/summary/{id}`. Do not write `/raw`; tools own details/structure.
- Allowed ops: `add` or `replace` only.
- Summary values must be strings; keep concise, faithful, and cite `sourceType/sourceId` when present.
- Use existing node ids from context when updating; do NOT invent new ids. If unsure, return an empty array.
- Maintain lineage in the summary text when relevant (mention sourceType/sourceId).
- Output a JSON array of patches (no prose). If unsure, return an empty array.

Good example (do this):
```json
[{"op":"replace","path":"/summary/goal","value":"Goal: plan Tokyo under $4k (source: user/input-1)"}]
```

Bad example (do NOT do this):
```json
[{"op":"add","path":"/raw/new-node","value":{"id":"new-node","details":{"secret":true}}}]
```
```

## Context builder contract
- Inputs: node summaries only (no raw details), ordered by priority:
  1) Goals/constraints
  2) Blockers: unknowns/dirty/invalid assumptions
  3) Active plans
  4) Top-K facts/assumptions (relevance/recency)
  5) Minimal timeline
- Token budget enforced; stable ordering for replay/determinism.
- Model: Grok 4.1 (`grok-4-1-fast-reasoning-latest`).

## Patch expectations
- No deletions. Ops limited to add/replace on /raw or /summary.
- Status must be in {open, blocked, resolved, dirty}; reject others.
- Summaries must reflect details; no hallucinations.
- Unknowns: create when required info missing; status=blocked or missing; mark dirty.
- Assumptions: set assumptionStatus; downgrade on contradiction/expiry.
- Structural changes must preserve lineage and mark affected nodes dirty.

## Failure/backoff
- If validation fails (bad op/path/status/id), return the error context and re-prompt with last error + minimal history.
- If external tools unavailable (X/Grok), fail loud per rules (no mock/fallback).

