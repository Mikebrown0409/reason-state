import React, { useMemo, useState } from "react";
import "./styles.css";
import { LeftPanel } from "./components/LeftPanel";
import { Timeline } from "./components/Timeline";
import { RightPanel } from "./components/RightPanel";
import { sampleTrace } from "./sampleTrace";

export default function App() {
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
    <div className="app">
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
      </div>

      <RightPanel steps={steps} active={active} />
    </div>
  );
}

