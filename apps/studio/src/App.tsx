import React, { useMemo, useState } from "react";
import "./styles.css";
import { LeftPanel } from "./components/LeftPanel";
import { Timeline } from "./components/Timeline";
import { RightPanel } from "./components/RightPanel";
import { sampleTrace } from "./sampleTrace";

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
export default function App() {
  const [showLeft, setShowLeft] = useState(true);
  const [showRight, setShowRight] = useState(true);
  const [active, setActive] = useState(0);
  const [goal, setGoal] = useState("When should we schedule the retro?");
  const [mode, setMode] = useState<"balanced" | "aggressive" | "deterministic">("balanced");
  const [vectorEnabled, setVectorEnabled] = useState(false);
  const steps = sampleTrace;

  const metrics = useMemo(() => {
    const ctx = "demo";
    return { tokenSavings: "~3x (demo)", contextChars: ctx.length, reused: 3, regenerated: 1 };
  }, []);

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
            mode={mode}
            onModeChange={setMode}
            vectorEnabled={vectorEnabled}
            onVectorToggle={setVectorEnabled}
            onRun={() => console.log("Run (stub)", { goal, mode, vectorEnabled })}
            onRetrieve={() => console.log("Retrieve-only (stub)", { goal })}
            metrics={metrics}
            governance="Clean"
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
            Mode: {mode} · Vector: {vectorEnabled ? "on" : "off"}
          </div>
        </div>
        <Timeline steps={steps} active={active} onSelect={setActive} />
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
        {showRight ? <RightPanel steps={steps} active={active} /> : null}
        <button className="collapse-btn" onClick={() => setShowRight((v) => !v)}>
          {showRight ? "›" : "‹"}
        </button>
      </div>
    </div>
  );
}

