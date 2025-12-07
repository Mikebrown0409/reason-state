"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.canExecute = exports.ReasonState = void 0;
exports.applyPatches = applyPatches;
exports.retractAssumption = retractAssumption;
exports.selfHealAndReplay = selfHealAndReplay;
var reconciliation_js_1 = require("./reconciliation.js");
Object.defineProperty(exports, "canExecute", { enumerable: true, get: function () { return reconciliation_js_1.canExecute; } });
var storage_js_1 = require("./storage.js");
var ReasonState = /** @class */ (function () {
    function ReasonState(options, initialState) {
        if (options === void 0) { options = {}; }
        this.options = options;
        this.state =
            initialState !== null && initialState !== void 0 ? initialState : {
                raw: {},
                summary: {},
                assumptions: [],
                unknowns: [],
                history: []
            };
    }
    Object.defineProperty(ReasonState.prototype, "snapshot", {
        get: function () {
            return this.state;
        },
        enumerable: false,
        configurable: true
    });
    ReasonState.prototype.canExecute = function (type) {
        return (0, reconciliation_js_1.canExecute)(type, this.state);
    };
    ReasonState.prototype.applyPatches = function (patches) {
        this.state = applyPatches(patches, this.state);
        return this.state;
    };
    ReasonState.prototype.retractAssumption = function (id) {
        this.state = retractAssumption(id, this.state);
        return this.state;
    };
    ReasonState.prototype.selfHealAndReplay = function (fromCheckpoint) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = this;
                        return [4 /*yield*/, selfHealAndReplay(this.state, fromCheckpoint)];
                    case 1:
                        _a.state = _b.sent();
                        return [2 /*return*/, this.state];
                }
            });
        });
    };
    ReasonState.prototype.checkpoint = function (turnId) {
        return __awaiter(this, void 0, void 0, function () {
            var cp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, storage_js_1.saveCheckpoint)(this.state, this.options.dbPath, turnId)];
                    case 1:
                        cp = _a.sent();
                        this.state.checkpointId = cp.id;
                        return [2 /*return*/, cp];
                }
            });
        });
    };
    ReasonState.prototype.restore = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var cp;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, (0, storage_js_1.loadCheckpoint)(id, this.options.dbPath)];
                    case 1:
                        cp = _a.sent();
                        this.state = cp.state;
                        return [2 /*return*/, this.state];
                }
            });
        });
    };
    return ReasonState;
}());
exports.ReasonState = ReasonState;
// Standalone helpers to keep API surface aligned with spec.
function applyPatches(patches, state) {
    var next = cloneState(state);
    var touched = new Set();
    for (var _i = 0, patches_1 = patches; _i < patches_1.length; _i++) {
        var patch = patches_1[_i];
        validatePatch(patch);
        if (patch.op === "remove") {
            removeByPath(next, patch.path);
        }
        else {
            setByPath(next, patch.path, patch.value);
        }
        next.history.push(patch);
        var nodeId = extractNodeId(patch.path);
        if (nodeId)
            touched.add(nodeId);
    }
    (0, reconciliation_js_1.propagateDirty)(next, Array.from(touched));
    resyncLists(next);
    return (0, reconciliation_js_1.applyReconciliation)(next);
}
function retractAssumption(id, state) {
    var next = cloneState(state);
    var node = next.raw[id];
    if (!node || node.type !== "assumption")
        return state;
    node.assumptionStatus = "retracted";
    node.status = "blocked";
    node.dirty = true;
    next.assumptions = next.assumptions.filter(function (a) { return a !== id; });
    next.history.push({
        op: "replace",
        path: "/raw/".concat(id),
        value: node,
        reason: "retractAssumption"
    });
    return (0, reconciliation_js_1.applyReconciliation)((0, reconciliation_js_1.propagateDirty)(next, [id]));
}
function selfHealAndReplay(state, fromCheckpoint) {
    return __awaiter(this, void 0, void 0, function () {
        var base, contradictions, patches, _i, contradictions_1, id, node, healed;
        var _a, _b;
        return __generator(this, function (_c) {
            base = cloneState(state);
            if (fromCheckpoint && ((_a = base.checkpoints) === null || _a === void 0 ? void 0 : _a[fromCheckpoint])) {
                base = cloneState(base.checkpoints[fromCheckpoint].state);
            }
            contradictions = (0, reconciliation_js_1.detectContradictions)(base);
            patches = [];
            for (_i = 0, contradictions_1 = contradictions; _i < contradictions_1.length; _i++) {
                id = contradictions_1[_i];
                node = base.raw[id];
                if (!node)
                    continue;
                node.status = "resolved";
                node.assumptionStatus = (_b = node.assumptionStatus) !== null && _b !== void 0 ? _b : "resolved";
                node.dirty = true;
                patches.push({
                    op: "replace",
                    path: "/raw/".concat(id),
                    value: node,
                    reason: "selfHeal:contradiction"
                });
            }
            healed = applyPatches(patches, base);
            return [2 /*return*/, healed];
        });
    });
}
function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
}
function extractNodeId(path) {
    var parts = path.split("/").filter(Boolean);
    if (parts[0] === "raw" && parts[1])
        return parts[1];
    return null;
}
function removeByPath(state, path) {
    var segments = path.split("/").filter(Boolean);
    if (segments[0] === "raw" && segments[1]) {
        delete state.raw[segments[1]];
    }
}
function setByPath(state, path, value) {
    var segments = path.split("/").filter(Boolean);
    if (segments[0] === "raw" && segments[1]) {
        state.raw[segments[1]] = value;
    }
    else if (segments[0] === "summary" && segments[1]) {
        state.summary[segments[1]] = String(value);
    }
}
function resyncLists(state) {
    state.unknowns = Object.values(state.raw)
        .filter(function (n) { return n.type === "unknown"; })
        .map(function (n) { return n.id; });
    state.assumptions = Object.values(state.raw)
        .filter(function (n) { return n.type === "assumption" && n.assumptionStatus !== "retracted"; })
        .map(function (n) { return n.id; });
}
function validatePatch(patch) {
    if (!["add", "replace", "remove"].includes(patch.op)) {
        throw new Error("invalid op: ".concat(patch.op));
    }
    if (!patch.path.startsWith("/raw") && !patch.path.startsWith("/summary")) {
        throw new Error("invalid path: ".concat(patch.path));
    }
    if (patch.op !== "remove" && patch.value === undefined) {
        throw new Error("value required for add/replace");
    }
}
// Inline assertions to ensure determinism and governance rules hold.
(function () {
    var _a;
    var base = {
        raw: {},
        summary: {},
        assumptions: [],
        unknowns: [],
        history: [],
        checkpoints: {}
    };
    // Unknown blocks canExecute.
    base.raw.u1 = { id: "u1", type: "unknown", status: "blocked", dirty: true };
    base.unknowns = ["u1"];
    console.assert((0, reconciliation_js_1.canExecute)("action", base) === false, "unknown should block actions");
    // applyPatches preserves append-only history and marks dirty.
    var after = applyPatches([{ op: "add", path: "/raw/f1", value: { id: "f1", type: "fact" } }], base);
    console.assert(after.history.length === 1, "history should append patches");
    console.assert(((_a = after.raw.f1) === null || _a === void 0 ? void 0 : _a.dirty) === false, "reconciliation clears dirty flags");
    // Retract assumption prunes list.
    var withAssumption = applyPatches([{ op: "add", path: "/raw/a1", value: { id: "a1", type: "assumption", assumptionStatus: "valid" } }], base);
    var retracted = retractAssumption("a1", withAssumption);
    console.assert(!retracted.assumptions.includes("a1"), "retracted assumption removed from list");
    // selfHeal resolves contradictions deterministically.
    var conflict = {
        raw: {
            f1: { id: "f1", type: "fact", details: { contradicts: "f2" } },
            f2: { id: "f2", type: "fact" }
        },
        summary: {},
        assumptions: [],
        unknowns: [],
        history: [],
        checkpoints: {}
    };
    selfHealAndReplay(conflict).then(function (healed) {
        var _a;
        console.assert(((_a = healed.raw.f2) === null || _a === void 0 ? void 0 : _a.status) === "resolved", "contradicted node resolved");
    });
})();
