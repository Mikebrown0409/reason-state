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
var DemoApp_js_1 = require("./DemoApp.js");
var ReasonState_js_1 = require("../src/engine/ReasonState.js");
var langGraphAdapter_js_1 = require("../src/adapters/langGraphAdapter.js");
var mockBooking_js_1 = require("../src/tools/mockBooking.js");
var xSearch_js_1 = require("../src/tools/xSearch.js");
var grokChat_js_1 = require("../src/tools/grokChat.js");
// Inline console.assert coverage for end-to-end behaviors.
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var result;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, DemoApp_js_1.runDemoFlow)()];
            case 1:
                result = _a.sent();
                console.assert(result.events.length === 5, "demo flow should emit 5 events");
                return [2 /*return*/];
        }
    });
}); })();
// Unknown gating scenario.
(function () {
    var engine = new ReasonState_js_1.ReasonState();
    (0, ReasonState_js_1.applyPatches)([{ op: "add", path: "/raw/u-block", value: { id: "u-block", type: "unknown", status: "blocked" } }], engine.snapshot);
    var canAct = engine.canExecute("action");
    console.assert(canAct === false, "unknown blocks execution");
})();
// Assumption retract + budget prune.
(function () {
    var _a, _b;
    var engine = new ReasonState_js_1.ReasonState();
    (0, ReasonState_js_1.applyPatches)([
        { op: "add", path: "/raw/assumption-dest", value: { id: "assumption-dest", type: "assumption", assumptionStatus: "valid" } },
        { op: "add", path: "/raw/budget", value: { id: "budget", type: "fact", details: { amount: 4500 } } }
    ], engine.snapshot);
    (0, ReasonState_js_1.retractAssumption)("assumption-dest", engine.snapshot);
    (0, ReasonState_js_1.applyPatches)([{ op: "replace", path: "/raw/budget", value: { id: "budget", type: "fact", details: { amount: 4000 } } }], engine.snapshot);
    console.assert(((_b = (_a = engine.snapshot.raw.budget) === null || _a === void 0 ? void 0 : _a.details) === null || _b === void 0 ? void 0 : _b["amount"]) === 4000, "budget reverted without deleting node");
})();
// Adapter gating should block when dirty/unknown present.
(function () {
    var engine = new ReasonState_js_1.ReasonState();
    (0, ReasonState_js_1.applyPatches)([{ op: "add", path: "/raw/u-block", value: { id: "u-block", type: "unknown", status: "blocked" } }], engine.snapshot);
    var graph = (0, langGraphAdapter_js_1.createDemoAgent)(engine);
    graph.invoke({ intent: "book", type: "action" }).then(function (out) {
        console.assert(out.intent === "blocked", "adapter should block when unknown exists");
    });
})();
// Booking tool blocks then unblocks when unknowns cleared.
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var blocked, ok;
    var _a, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0: return [4 /*yield*/, (0, mockBooking_js_1.mockBooking)({ id: "t1", unknowns: ["u1"] })];
            case 1:
                blocked = _e.sent();
                console.assert(((_b = (_a = blocked[0]) === null || _a === void 0 ? void 0 : _a.value) === null || _b === void 0 ? void 0 : _b["status"]) === "blocked", "booking should block on unknowns");
                return [4 /*yield*/, (0, mockBooking_js_1.mockBooking)({ id: "t1", destination: "Amsterdam", budget: 4000 })];
            case 2:
                ok = _e.sent();
                console.assert(((_d = (_c = ok[0]) === null || _c === void 0 ? void 0 : _c.value) === null || _d === void 0 ? void 0 : _d["status"]) === "resolved", "booking should resolve when unknowns cleared");
                return [2 /*return*/];
        }
    });
}); })();
// Live X search (requires VITE_X_BEARER_TOKEN). Throws if missing.
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var results;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, xSearch_js_1.xSearch)("Tokyo travel")];
            case 1:
                results = _a.sent();
                console.assert(results.length > 0, "X search should return results");
                return [2 /*return*/];
        }
    });
}); })();
// Live Grok call (requires VITE_GROK_API_KEY). Throws if missing.
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var msg;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, (0, grokChat_js_1.grokChat)("Say hello briefly.")];
            case 1:
                msg = _a.sent();
                console.assert(msg.length > 0, "Grok chat should return content");
                return [2 /*return*/];
        }
    });
}); })();
// LangGraph agent end-to-end (relies on live X + Grok + mock booking).
(function () { return __awaiter(void 0, void 0, void 0, function () {
    var engine, agent, out;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                engine = new ReasonState_js_1.ReasonState();
                agent = (0, langGraphAdapter_js_1.createDemoAgent)(engine);
                return [4 /*yield*/, agent.invoke({ query: "Tokyo travel" })];
            case 1:
                out = _a.sent();
                console.assert(out.plan !== "blocked", "Agent should not be blocked when clean");
                return [2 /*return*/];
        }
    });
}); })();
