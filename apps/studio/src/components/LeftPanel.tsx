import React from "react";

type Props = {
  goal: string;
  onGoalChange: (v: string) => void;
  mode: "balanced" | "aggressive" | "deterministic";
  onModeChange: (m: "balanced" | "aggressive" | "deterministic") => void;
  vectorEnabled: boolean;
  onVectorToggle: (v: boolean) => void;
  onRun: () => void;
  onRetrieve: () => void;
  metrics: { tokenSavings: string; contextChars: number; reused: number; regenerated: number };
  governance: string;
};

export function LeftPanel(props: Props) {
  const modes: Array<Props["mode"]> = ["balanced", "aggressive", "deterministic"];
  return (
    <div className="panel">
      <div className="header">
        <div>
          <div className="muted" style={{ fontSize: 12 }}>
            Governance
          </div>
          <div className="badge amber">{props.governance}</div>
        </div>
        <div className="badge">Keyless demo</div>
      </div>

      <div className="section">
        <h4>Goal</h4>
        <textarea
          className="input"
          rows={3}
          value={props.goal}
          onChange={(e) => props.onGoalChange(e.target.value)}
          placeholder="Ask your agent..."
        />
      </div>

      <div className="section">
        <h4>Modes</h4>
        <div className="segmented">
          {modes.map((m) => (
            <button
              key={m}
              className={props.mode === m ? "active" : ""}
              onClick={() => props.onModeChange(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="toggle-row">
          <div className="muted" style={{ fontSize: 12 }}>
            Vector
          </div>
          <button
            className={`toggle ${props.vectorEnabled ? "on" : ""}`}
            onClick={() => props.onVectorToggle(!props.vectorEnabled)}
            aria-label="Toggle vector"
          />
          <div className="muted" style={{ fontSize: 12 }}>
            {props.vectorEnabled ? "on" : "off"}
          </div>
        </div>
      </div>

      <div className="section" style={{ display: "flex", gap: 8 }}>
        <button className="button" onClick={props.onRun}>
          Run
        </button>
        <button className="button ghost" onClick={props.onRetrieve}>
          Retrieve-only
        </button>
      </div>

      <div className="section">
        <h4>Metrics</h4>
        <div className="badge">Token savings: {props.metrics.tokenSavings}</div>
        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
          Context chars: {props.metrics.contextChars} · Reused: {props.metrics.reused} · Regenerated:{" "}
          {props.metrics.regenerated}
        </div>
      </div>
    </div>
  );
}

