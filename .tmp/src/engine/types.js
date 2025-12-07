"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmptyState = createEmptyState;
// Helpers to make inline tests readable and provide a clean starting state.
function createEmptyState() {
    return {
        raw: {},
        summary: {},
        assumptions: [],
        unknowns: [],
        history: [],
        checkpoints: {}
    };
}
// Inline sanity checks (console.assert) to guard lifecycle expectations.
(function () {
    var state = createEmptyState();
    // Unknown gating: unknown nodes should be tracked separately.
    var unknownNode = {
        id: "u1",
        type: "unknown",
        status: "blocked",
        dirty: true
    };
    state.raw[unknownNode.id] = unknownNode;
    state.unknowns.push(unknownNode.id);
    console.assert(state.unknowns.includes("u1"), "unknown node must register in unknowns list");
    // Assumption lifecycle: valid -> superseded -> retracted.
    var assumption = {
        id: "a1",
        status: "valid",
        createdAt: "2025-01-01T00:00:00Z"
    };
    console.assert(assumption.status === "valid", "assumption starts valid");
    assumption.status = "superseded";
    console.assert(assumption.status === "superseded", "assumption can be superseded");
    assumption.status = "retracted";
    console.assert(assumption.status === "retracted", "assumption can be retracted");
    // Patch typing: optional value only when not remove.
    var addPatch = { op: "add", path: "/raw/u1", value: unknownNode };
    var removePatch = { op: "remove", path: "/raw/u1" };
    console.assert(addPatch.value !== undefined && removePatch.value === undefined, "remove op omits value; add/replace carry value");
})();
