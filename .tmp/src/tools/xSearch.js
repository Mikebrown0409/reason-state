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
exports.xSearch = xSearch;
function getBearer() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
    var token = (_p = (_o = (_m = (_f = (_c = (_b = (_a = globalThis === null || globalThis === void 0 ? void 0 : globalThis.process) === null || _a === void 0 ? void 0 : _a.env) === null || _b === void 0 ? void 0 : _b.X_BEARER_TOKEN) !== null && _c !== void 0 ? _c : (_e = (_d = globalThis === null || globalThis === void 0 ? void 0 : globalThis.process) === null || _d === void 0 ? void 0 : _d.env) === null || _e === void 0 ? void 0 : _e.GROK_API_KEY) !== null && _f !== void 0 ? _f : (typeof import.meta !== "undefined"
        ? (_j = (_h = (_g = import.meta) === null || _g === void 0 ? void 0 : _g.env) === null || _h === void 0 ? void 0 : _h.VITE_X_BEARER_TOKEN) !== null && _j !== void 0 ? _j : (_l = (_k = import.meta) === null || _k === void 0 ? void 0 : _k.env) === null || _l === void 0 ? void 0 : _l.VITE_GROK_API_KEY
        : undefined)) !== null && _m !== void 0 ? _m : (typeof __VITE_X_BEARER_TOKEN__ !== "undefined" && __VITE_X_BEARER_TOKEN__.length > 0
        ? __VITE_X_BEARER_TOKEN__
        : undefined)) !== null && _o !== void 0 ? _o : (typeof __VITE_GROK_API_KEY__ !== "undefined" && __VITE_GROK_API_KEY__.length > 0
        ? __VITE_GROK_API_KEY__
        : undefined)) !== null && _p !== void 0 ? _p : (typeof window !== "undefined"
        ? (_q = window === null || window === void 0 ? void 0 : window.VITE_X_BEARER_TOKEN) !== null && _q !== void 0 ? _q : window === null || window === void 0 ? void 0 : window.VITE_GROK_API_KEY
        : undefined);
    if (typeof token === "string" && token.trim().length === 0)
        return undefined;
    return token;
}
function xSearch(query) {
    return __awaiter(this, void 0, void 0, function () {
        var token, base, url, startTime, res, _a, _b, _c, data, err_1;
        var _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    token = getBearer();
                    if (!token) {
                        console.warn("X search skipped: no X_BEARER_TOKEN / GROK_API_KEY / VITE_ env set");
                        return [2 /*return*/, []];
                    }
                    base = typeof window !== "undefined" ? "/x-api" : "https://api.twitter.com";
                    url = new URL("".concat(base, "/2/tweets/search/recent"), typeof window !== "undefined" ? window.location.origin : undefined);
                    startTime = new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString();
                    url.searchParams.set("query", "".concat(query, " lang:en"));
                    url.searchParams.set("start_time", startTime);
                    url.searchParams.set("max_results", "10"); // API requires 10-100
                    _e.label = 1;
                case 1:
                    _e.trys.push([1, 6, , 7]);
                    return [4 /*yield*/, fetch(url.toString(), {
                            headers: {
                                Authorization: "Bearer ".concat(token)
                            }
                        })];
                case 2:
                    res = _e.sent();
                    if (!!res.ok) return [3 /*break*/, 4];
                    _b = (_a = console).error;
                    _c = ["xSearch fetch error", res.status];
                    return [4 /*yield*/, res.text()];
                case 3:
                    _b.apply(_a, _c.concat([_e.sent()]));
                    return [2 /*return*/, []];
                case 4: return [4 /*yield*/, res.json()];
                case 5:
                    data = (_e.sent());
                    return [2 /*return*/, ((_d = data.data) !== null && _d !== void 0 ? _d : []).map(function (hit) { return ({
                            op: "add",
                            path: "/raw/".concat(hit.id),
                            value: {
                                id: hit.id,
                                type: "assumption",
                                summary: hit.text,
                                details: { author: hit.author, created_at: hit.created_at, query: query },
                                assumptionStatus: "valid"
                            }
                        }); })];
                case 6:
                    err_1 = _e.sent();
                    console.error("xSearch fetch failed", err_1);
                    return [2 /*return*/, []];
                case 7: return [2 /*return*/];
            }
        });
    });
}
