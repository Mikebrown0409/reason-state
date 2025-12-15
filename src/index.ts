// Front-door API (recommended for most users)
export { ReasonStateAuto } from "./api/auto.js";
export { ReasonStateAuto as default } from "./api/auto.js";

// Simple API (more control, still user-friendly)
export { ReasonStateSimple } from "./api/simple.js";
export { ReasonStateSimple as ReasonState } from "./api/simple.js";

// Advanced API (direct engine access)
export { ReasonState as ReasonStateAdvanced } from "./engine/ReasonState.js";

// Types
export type { EchoState, NodeType, Patch, Checkpoint } from "./engine/types.js";

// Engine utilities (for advanced use cases)
export { applyPatches, retractAssumption, selfHealAndReplay } from "./engine/ReasonState.js";
export { canExecute } from "./engine/reconciliation.js";
export { InMemoryVectorStore } from "./context/vectorStore.js";
