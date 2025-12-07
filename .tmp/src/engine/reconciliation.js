"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.propagateDirty = propagateDirty;
exports.detectContradictions = detectContradictions;
exports.canExecute = canExecute;
exports.applyReconciliation = applyReconciliation;
function propagateDirty(state, nodeIds) {
    var _a;
    var queue = __spreadArray([], nodeIds, true);
    var seen = new Set();
    while (queue.length) {
        var id = queue.shift();
        if (seen.has(id))
            continue;
        seen.add(id);
        var node = state.raw[id];
        if (!node)
            continue;
        node.dirty = true;
        if (node.parentId)
            queue.push(node.parentId);
        ((_a = node.children) !== null && _a !== void 0 ? _a : []).forEach(function (childId) { return queue.push(childId); });
    }
    return state;
}
// Detect contradictions by scanning nodes that explicitly reference conflicts.
function detectContradictions(state) {
    var contradictions = [];
    for (var _i = 0, _a = Object.values(state.raw); _i < _a.length; _i++) {
        var node = _a[_i];
        var details = node.details;
        var conflictingId = details === null || details === void 0 ? void 0 : details.contradicts;
        if (conflictingId && state.raw[conflictingId]) {
            contradictions.push(conflictingId);
        }
    }
    return contradictions;
}
function canExecute(type, state) {
    if (state.unknowns.length > 0)
        return false;
    var hasDirty = Object.values(state.raw).some(function (n) { return n.dirty; });
    if (hasDirty)
        return false;
    if (type === "action") {
        var invalidAssumption = Object.values(state.raw).some(function (n) { return n.type === "assumption" && n.assumptionStatus && n.assumptionStatus !== "valid"; });
        if (invalidAssumption)
            return false;
    }
    return true;
}
// Minimal reconciliation: clears dirty flags after semantic activation stub.
function applyReconciliation(state) {
    var _a;
    for (var _i = 0, _b = Object.values(state.raw); _i < _b.length; _i++) {
        var node = _b[_i];
        if (node.dirty) {
            node.summary = (_a = node.summary) !== null && _a !== void 0 ? _a : stringifyDetails(node);
            node.dirty = false;
        }
    }
    return state;
}
function stringifyDetails(node) {
    if (typeof node.details === "string")
        return node.details;
    try {
        return JSON.stringify(node.details);
    }
    catch (_a) {
        return "";
    }
}
