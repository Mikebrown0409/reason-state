export { ReasonState } from "./engine/ReasonState.js";
export type { EchoState, NodeType, Patch, Checkpoint } from "./engine/types.js";
export { applyPatches, retractAssumption, selfHealAndReplay } from "./engine/ReasonState.js";
export { canExecute } from "./engine/reconciliation.js";
// Adapters removed; keep core exports lean.
