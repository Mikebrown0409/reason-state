import React, { useMemo, useState } from "react";
import "./styles.css";
import { LeftPanel } from "./components/LeftPanel";
import { Timeline } from "./components/Timeline";
import { RightPanel } from "./components/RightPanel";
import { sampleTrace, type StudioStep } from "./sampleTrace";
import type { EchoState } from "../../../src/engine/types";
import { buildContext } from "../../../src/context/contextBuilder";
import { InMemoryVectorStore } from "../../../src/context/vectorStore";

// Compact 5-row matrix for "REASON STATE" (4px letters, 1px spacers)
const LETTERS: Record<string, number[][]> = {
  R: [
    [1,1,1,0],
    [1,0,0,1],
    [1,1,1,0],
    [1,0,1,0],
    [1,0,0,1],
  ],
  E: [
    [1,1,1,1],
    [1,1,0,0],
    [1,1,1,0],
    [1,1,0,0],
    [1,1,1,1],
  ],
  A: [
    [0,1,1,0],
    [1,0,0,1],
    [1,1,1,1],
    [1,0,0,1],
    [1,0,0,1],
  ],
  S: [
    [0,1,1,1],
    [1,1,0,0],
    [0,0,1,1],
    [0,0,1,1],
    [1,1,1,0],
  ],
  O: [
    [0,1,1,0],
    [1,0,0,1],
    [1,0,0,1],
    [1,0,0,1],
    [0,1,1,0],
  ],
  N: [
    [1,0,0,1],
    [1,1,0,1],
    [1,0,1,1],
    [1,0,0,1],
    [1,0,0,1],
  ],
  T: [
    [1,1,1,1],
    [0,1,1,0],
    [0,1,1,0],
    [0,1,1,0],
    [0,1,1,0],
  ],
  E2: [
    [1,1,1,1],
    [1,1,0,0],
    [1,1,1,0],
    [1,1,0,0],
    [1,1,1,1],
  ],
};

const buildMatrix = (sequence: string[]): number[][] => {
  const spacer = [0]; // between letters
  const wordSpacer = [0,0]; // between words
  const rows = Array.from({ length: 5 }, () => [] as number[]);
  sequence.forEach((char, idx) => {
    if (char === "SPACE") {
      rows.forEach((r) => r.push(...wordSpacer));
      return;
    }
    const glyph = LETTERS[char] ?? LETTERS.E;
    glyph.forEach((glyphRow, rowIdx) => {
      rows[rowIdx].push(...glyphRow);
    });
    const next = sequence[idx + 1];
    if (next) {
      rows.forEach((r) => r.push(...spacer));
    }
  });
  return rows;
};

const REASON_STATE_MATRIX = buildMatrix([
  "R",
  "E",
  "A",
  "S",
  "O",
  "N",
  "SPACE",
  "S",
  "T",
  "A",
  "T",
  "E",
]);

const TOTAL_COLS = REASON_STATE_MATRIX[0].length;

type ImportedStep = Partial<StudioStep> & { label?: string; state?: Partial<EchoState> };

const synthNode = (id: string, summary: string) => ({
  id,
  type: "fact",
  summary,
  status: "open",
});

const coerceState = (state: Partial<EchoState> | undefined, fallbackSummary: string): EchoState => {
  const safeRaw = state?.raw && typeof state.raw === "object" ? state.raw : {};
  const raw =
    safeRaw && Object.keys(safeRaw).length > 0
      ? safeRaw
      : { imported: synthNode("imported", fallbackSummary || "Imported step") };
  return {
    raw,
    summary: state?.summary ?? {},
    assumptions: state?.assumptions ?? [],
    unknowns: state?.unknowns ?? [],
    history: state?.history ?? [],
  };
};

const normalizeSteps = (input: unknown[]): StudioStep[] => {
  // If this looks like an OpenAI/Anthropic messages log, adapt it first
  if (input.length && typeof input[0] === "object" && (input[0] as any)?.role) {
    return adaptMessages(input as any[]);
  }
  return input.map((step, idx) => {
    const s = step as ImportedStep;
    const fallbackText =
      (s as any)?.result ??
      (s as any)?.summary ??
      (s.state as any)?.summaryText ??
      `Imported step ${idx + 1}`;
    const state = coerceState(s.state, typeof fallbackText === "string" ? fallbackText : JSON.stringify(fallbackText));
    const adapted = !s.state?.raw || Object.keys(s.state.raw as object ?? {}).length === 0;
    const patches = Array.isArray(s.patches) ? (s.patches as StudioStep["patches"]) : [];
    return {
      label: s.label || `Step ${idx + 1}`,
      state,
      patches,
      adapted,
    };
  });
};

const summarizeImport = (steps: StudioStep[]): string => {
  const totalNodes = steps.reduce((acc, s) => acc + Object.keys(s.state.raw ?? {}).length, 0);
  const adapted = steps.filter((s) => s.adapted).length;
  return `Imported ${steps.length} steps, ${totalNodes} nodes${adapted ? ` · ${adapted} auto-adapted` : ""}`;
};

type Message = { role: string; content?: any; tool_calls?: Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }> };

const adaptMessages = (messages: Message[]): StudioStep[] => {
  return messages.map((m, idx) => {
    const nodes: Record<string, any> = {};
    const label = `Turn ${idx + 1} — ${m.role}`;
    // Primary content node
    if (m.content) {
      const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      nodes[`msg-${idx}`] = {
        id: `msg-${idx}`,
        type: m.role === "user" ? "fact" : m.role === "assistant" ? "action" : "fact",
        summary: text.slice(0, 280),
        status: "open",
        sourceType: "import/message",
        sourceId: `turn-${idx}`,
      };
    }
    // Tool calls
    if (Array.isArray(m.tool_calls)) {
      m.tool_calls.forEach((t, tIdx) => {
        const text = t.function?.arguments ?? "";
        const name = t.function?.name ?? t.type ?? "tool";
        nodes[`tool-${idx}-${tIdx}`] = {
          id: `tool-${idx}-${tIdx}`,
          type: "action",
          summary: `${name}: ${text}`.slice(0, 280),
          status: "open",
          sourceType: "import/tool_call",
          sourceId: t.id ?? `${idx}-${tIdx}`,
        };
      });
    }
    const state: EchoState = {
      raw: nodes,
      summary: {},
      assumptions: [],
      unknowns: [],
      history: [],
    };
    return {
      label,
      state,
      patches: [],
      adapted: true,
    };
  });
};
export default function App() {
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [active, setActive] = useState(0);
  const [goal, setGoal] = useState("When should we schedule the retro?");
  const [vectorEnabled, setVectorEnabled] = useState(false);
  const [steps, setSteps] = useState<StudioStep[]>(sampleTrace);
  const [compareOn, setCompareOn] = useState(false);
  const vectorStoreRef = useMemo(() => new InMemoryVectorStore(), []);
  const [importSummary, setImportSummary] = useState<string | null>(null);

const estimateTokens = (text: string): number => Math.max(1, Math.ceil(text.length / 4));

  const handleLoadSample = () => {
    setSteps(sampleTrace);
    setActive(0);
    setImportSummary(summarizeImport(sampleTrace));
  };

  const handleImportTrace = (json: string) => {
    if (!json.trim()) return;
    try {
      const parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) throw new Error("Trace must be an array of steps");
      const normalized = normalizeSteps(parsed);
      setSteps(normalized);
      setActive(0);
      setImportSummary(summarizeImport(normalized));
    } catch (err) {
      console.error("Import failed", err);
      alert("Could not import trace. Expect an array of steps. If raw/state are missing, include some text to synthesize.");
    }
  };

  const appendActionStep = (sourceIdx: number, kind: "retract" | "rollback") => {
    const src = steps[sourceIdx];
    if (!src) return;
    const id = `${kind}-${Date.now()}`;
    const newNode = {
      id,
      type: "action",
      summary: `${kind} from turn ${sourceIdx + 1}`,
      status: "open",
    };
    const newState: EchoState = {
      ...src.state,
      raw: { ...src.state.raw, [id]: newNode },
    };
    const newStep: StudioStep = {
      label: `Turn ${steps.length + 1} — ${kind}`,
      state: newState,
      patches: [
        ...src.patches,
        { op: "add", path: `/raw/${id}`, value: newNode.summary },
      ],
      adapted: true,
    };
    const next = [...steps, newStep];
    setSteps(next);
    setActive(next.length - 1);
  };

  const metrics = useMemo(() => {
    const ctx = "demo";
    return { tokenSavings: "~3x (demo)", contextChars: ctx.length, reused: 3, regenerated: 1 };
  }, []);

  const compareStats = useMemo(() => {
    const step = steps[active];
    if (!step) return null;
    const rawString = JSON.stringify(step.state.raw ?? {});
    const naiveChars = Math.max(rawString.length, 1);
    // Upsert current raw text into vector store when enabled
    if (vectorEnabled) {
      const nodes = Object.values(step.state.raw ?? {}).map((n) => ({
        id: n.id,
        text: n.summary ?? "",
      }));
      try {
        vectorStoreRef.upsert(nodes);
      } catch {
        // ignore vector errors to keep UI responsive
      }
    }
    // governed: actual buildContext output length with current mode/vector flags (vector optional)
    const body = buildContext(step.state, {
      mode: "balanced",
      includeTimeline: false,
      maxChars: 4000,
      vectorStore: vectorEnabled ? vectorStoreRef : undefined,
      vectorTopK: 20,
      queryText: vectorEnabled ? goal : undefined,
    });
    const governedChars = Math.max(body.length, 1);
    const naiveTokens = estimateTokens(rawString);
    const governedTokens = estimateTokens(body);
    const savingsPct = Math.max(0, Math.round(((naiveTokens - governedTokens) / naiveTokens) * 100));
    return { naiveChars, governedChars, naiveTokens, governedTokens, savingsPct, body };
  }, [steps, active, vectorEnabled, goal, vectorStoreRef]);

  return (
    <div
      className="app"
      style={{
        gridTemplateColumns: `${showLeft ? "280px" : "28px"} 1fr ${showRight ? "360px" : "28px"}`,
      }}
    >
      <div className="panel" style={{ padding: showLeft ? 16 : 6 }}>
        {showLeft ? (
          <LeftPanel
            goal={goal}
            onGoalChange={setGoal}
            vectorEnabled={vectorEnabled}
            onVectorToggle={setVectorEnabled}
            onRun={() => console.log("Run (stub)", { goal, vectorEnabled })}
            onRetrieve={() => console.log("Retrieve-only (stub)", { goal })}
            metrics={metrics}
            governance="Clean"
            onLoadSample={handleLoadSample}
            onImportTrace={handleImportTrace}
            importSummary={importSummary}
          />
        ) : null}
        <button className="collapse-btn" onClick={() => setShowLeft((v) => !v)}>
          {showLeft ? "‹" : "›"}
        </button>
      </div>

      <div className="main">
        <div className="header">
          <div>
            <div className="muted" style={{ fontSize: 12 }}>
              Timeline
            </div>
            <div className="badge">Deterministic replay</div>
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            Vector: {vectorEnabled ? "on" : "off"}
            {" · "}
            <label style={{ cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={compareOn}
                onChange={(e) => setCompareOn(e.target.checked)}
                style={{ marginRight: 4 }}
              />
              Compare
            </label>
          </div>
        </div>
        <Timeline
          steps={steps}
          active={active}
          onSelect={setActive}
          onRetract={(idx) => appendActionStep(idx, "retract")}
          onRollback={(idx) => appendActionStep(idx, "rollback")}
        />
        {compareOn && compareStats ? (
          <div className="compare-bar">
            <div className="compare-label">Context size</div>
            <div className="compare-metrics">
              <span className="naive">
                Naive: {compareStats.naiveTokens} tok ({compareStats.naiveChars} chars)
              </span>
              <span className="governed">
                Governed: {compareStats.governedTokens} tok ({compareStats.governedChars} chars)
              </span>
              <span className="savings">Savings: {compareStats.savingsPct}%</span>
            </div>
          </div>
        ) : null}
        <div
          className="dot-grid"
          style={{
            gridTemplateColumns: `repeat(${TOTAL_COLS}, 7px)`,
            gridTemplateRows: `repeat(${REASON_STATE_MATRIX.length}, 7px)`,
            marginTop: 4,
          }}
        >
          {REASON_STATE_MATRIX.map((row, rowIdx) =>
            row.map((bit, colIdx) => {
              const progress =
                steps.length <= 1 ? 1 : active / Math.max(steps.length - 1, 1);
              const filledCols = Math.floor(progress * TOTAL_COLS);
              const filled = bit === 1 && colIdx <= filledCols;
              const dim = bit === 1 && !filled;
              return (
                <div
                  key={`${rowIdx}-${colIdx}`}
                  className={`dot ${filled ? "filled" : dim ? "dim" : ""}`}
                />
              );
            })
          )}
        </div>
      </div>

      <div className="panel right" style={{ padding: showRight ? 16 : 6 }}>
        {showRight ? <RightPanel steps={steps} active={active} contextBody={compareStats?.body} /> : null}
        <button className="collapse-btn" onClick={() => setShowRight((v) => !v)}>
          {showRight ? "›" : "‹"}
        </button>
      </div>
    </div>
  );
}

