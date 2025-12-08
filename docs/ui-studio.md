## ReasonState Debugger Studio — UI spec (v1)

Goal: a single-page, dark-mode xAI-style experience that showcases governed memory, rollback, and deterministic replay without scrolling.

### Layout (three regions, fixed height with internal scroll)
- **Left**: Inputs + governance (dark panel)
  - Dynamic input stack so different agents can surface custom fields (destination/goal, budget, dates, optional facts, agent-specific params).
  - Clean/Blocked pill with reasons (unknowns, dirty nodes, blocked actions).
  - Agent-note / next-step card (shows current `/summary/agent-note`).
- **Center**: Timeline carousel (primary focus)
  - Top-left of this region: agent selector (non-collapsible) to switch between simple/DAG/custom agents.
  - Horizontal carousel/stepper; each step card is large, dark, with accent highlights:
    - Turn label, diff summary (reused vs regenerated), key node chips with inline rollback/recompute.
    - Actions per card:
      - Assumption: “Retract & recompute” (wraps `retractAssumption` + rerun).
      - Action blocked: “Rollback subtree & recompute” (wraps rollback + rerun).
    - Smooth animate on scrub; no outer page scroll.
- **Right (collapsible by default)**: Details panel
  - Stays collapsed until opened or a card is clicked.
  - Tabs:
    - **State diff**: JSON state for active step with inline red/green highlighting vs previous step (avoid separate subtree diff view).
    - **What the model saw**: `buildContext` output (summaries only) for the active step.
    - **Replay/deterministic**: terminal-style log (black bg, green text) with play/pause to auto-advance patches and show determinism badge (raw+summary match + patch count).

### Visual language
- Dark mode base (charcoal/black) + single accent color; high-contrast cards.
- Generous whitespace, 12–14px monospace in terminal/log tabs, 13–14px sans elsewhere.
- Panels scroll internally; outer page stays fixed-height (no vertical page scroll).

### Data bindings (from existing engine)
- History/timeline: `history[idx].state`.
- Governance pill: unknowns, dirty nodes, blocked actions from `state`.
- Diff summary: compare `state.raw` of current vs previous; show reused/regenerated counts.
- Node cards: `state.raw` entries with `dependsOn`, `temporalBefore/After`, `status`, `dirty`.
- State diff tab: `state.raw` current vs prior with red/green highlights.
- Patch log tab: `state.history` (append-only patches); reverse order for viewing, forward for replay animation.
- Context tab: `buildContext(state)` with timeline tail.

### Interactions
- Scrub slider or click step card → center and (if open) right panel animate to that state; opening right panel when a card is clicked is allowed.
- Play mode in replay/deterministic tab → patches auto-advance, highlighting changed nodes.
- Buttons:
  - Run / Recompute (semantic) / Rollback (temporal) — reuse existing run helpers.
  - Per-node retract/rollback actions fire recompute with appropriate target id.
- Reset clears state and calendar holds (existing helper).

### Success criteria
- All key governance signals visible at a glance (blocked reasons, determinism badge, unknowns/dirty).
- Replay and rollback are discoverable and one-click.
- No reliance on hidden internals: only uses `ReasonState`, `facade`, `planAndAct`, `buildContext`.

