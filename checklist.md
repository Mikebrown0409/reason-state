## Post-hackathon checklist

### Core hardening (adoption-first)
- Stabilize public API surface (`ReasonState`, `planAndAct`, `buildContext`, `facade.*`, types); hide demo-only exports.
- Add “API guarantees” section to README (invariants: append-only, no deletes, validated patches, deterministic replay).
- Complete governance gaps: richer status/assumption lifecycle, contradiction self-heal loop, cross-turn `canExecute`.
- Finish Tokyo→retract→Amsterdam deterministic replay test (assert flights reused, hotels changed, raw+summary match).
- Expand integration tests: governance gating, token/time savings, checkpoint/replay determinism.

### Docs and packaging
- README: Concepts, Integrate in your agent (BYO tools vs `planAndAct`), Failure policy.
- Add CHANGELOG and cut `0.2.0` “post-hackathon” release; mark breaking vs non-breaking.
- Ensure examples are separate from shipped package (demo agents, mock tools stay in `examples/`).

### Examples for adopters
- BYO-tools agent using ReasonState for governed memory/replay only.
- LangGraph/Temporal-lite style example showing rollback/replay/unknown handling.
- Scripted scenario demonstrating unknowns, contradiction resolution, rollback, determinism badge.

### Debugger Studio (UI) v1
- Single-page layout: left inputs/governance pill, center timeline carousel, right terminal-style log.
- Node cards with status/edges, inline retract/rollback actions; reuse vs regenerated counts.
- Timeline scrubbing animates center and log; “play” mode replays patches.
- Tabs in right column: Patch log, “What the model saw” (buildContext output), determinism badge.
- Minimal monochrome palette with one accent; no page scroll (panels scroll internally).

### DX polish
- Clear failure modes (no mocks, real keys required) surfaced in UI and docs.
- Ensure `facade` entry points cover rollback/recompute flows used by the Studio.
- Add GIF/screenshot of Studio to README once stable.

### Testing stance during UI redesign
- Pause visual/snapshot regression tests until the new Studio layout stabilizes.
- Keep fast functional/integration coverage: determinism, governance gating, rollback/replay.
- Add a minimal manual smoke checklist for Studio interactions (scrub timeline, open right panel tabs, rollback/recompute) before releases.

