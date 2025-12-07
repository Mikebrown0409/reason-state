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
exports.saveCheckpoint = saveCheckpoint;
exports.loadCheckpoint = loadCheckpoint;
var DEFAULT_DB = ":memory:";
var isBrowser = typeof window !== "undefined";
var memStore = new Map();
function saveCheckpoint(state_1) {
    return __awaiter(this, arguments, void 0, function (state, dbPath, turnId) {
        var id, createdAt, checkpoint_1, db, checkpoint;
        if (dbPath === void 0) { dbPath = DEFAULT_DB; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    id = crypto.randomUUID();
                    createdAt = new Date().toISOString();
                    if (isBrowser) {
                        checkpoint_1 = { id: id, state: state, createdAt: createdAt, turnId: turnId };
                        memStore.set(id, checkpoint_1);
                        if (!state.checkpoints)
                            state.checkpoints = {};
                        state.checkpoints[id] = checkpoint_1;
                        return [2 /*return*/, checkpoint_1];
                    }
                    return [4 /*yield*/, open(dbPath)];
                case 1:
                    db = _a.sent();
                    db.prepare("INSERT INTO checkpoints (id, payload, createdAt, turnId) VALUES (?, ?, ?, ?)").run(id, JSON.stringify(state), createdAt, turnId !== null && turnId !== void 0 ? turnId : null);
                    checkpoint = { id: id, state: state, createdAt: createdAt, turnId: turnId };
                    if (!state.checkpoints)
                        state.checkpoints = {};
                    state.checkpoints[id] = checkpoint;
                    return [2 /*return*/, checkpoint];
            }
        });
    });
}
function loadCheckpoint(id_1) {
    return __awaiter(this, arguments, void 0, function (id, dbPath) {
        var cp, db, row, state;
        var _a;
        if (dbPath === void 0) { dbPath = DEFAULT_DB; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (isBrowser) {
                        cp = memStore.get(id);
                        if (!cp)
                            throw new Error("Checkpoint not found: ".concat(id));
                        return [2 /*return*/, cp];
                    }
                    return [4 /*yield*/, open(dbPath)];
                case 1:
                    db = _b.sent();
                    row = db
                        .prepare("SELECT payload, createdAt, turnId FROM checkpoints WHERE id = ?")
                        .get(id);
                    if (!row)
                        throw new Error("Checkpoint not found: ".concat(id));
                    state = JSON.parse(row.payload);
                    return [2 /*return*/, { id: id, state: state, createdAt: row.createdAt, turnId: (_a = row.turnId) !== null && _a !== void 0 ? _a : undefined }];
            }
        });
    });
}
function open(dbPath) {
    return __awaiter(this, void 0, void 0, function () {
        var Database, db;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require("better-sqlite3"); })];
                case 1:
                    Database = (_a.sent()).default;
                    db = new Database(dbPath);
                    db.prepare("CREATE TABLE IF NOT EXISTS checkpoints (id TEXT PRIMARY KEY, payload TEXT, createdAt TEXT, turnId TEXT)").run();
                    return [2 /*return*/, db];
            }
        });
    });
}
// Inline assertions for checkpoint safety (node only).
(function () {
    if (isBrowser)
        return;
    var state = {
        raw: {},
        summary: {},
        assumptions: [],
        unknowns: [],
        history: [],
        checkpoints: {}
    };
    saveCheckpoint(state).then(function (cp) {
        console.assert(cp.id, "checkpoint must have id");
        loadCheckpoint(cp.id).then(function (loaded) {
            console.assert(loaded.id === cp.id, "loaded checkpoint id matches");
        });
    });
})();
