import React, { useState } from "react";

type Props = {
  goal: string;
  onGoalChange: (v: string) => void;
  vectorEnabled: boolean;
  onVectorToggle: (v: boolean) => void;
  onRun: () => void;
  onRetrieve: () => void;
  metrics: { tokenSavings: string; contextChars: number; reused: number; regenerated: number };
  governance: string;
  onLoadSample: () => void;
  onImportTrace: (json: string) => void;
  importSummary: string | null;
};

export function LeftPanel(props: Props) {
  const [traceInput, setTraceInput] = useState("");

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

      <div className="section" style={{ display: "grid", gap: 8 }}>
        <h4>Quick start</h4>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="button" onClick={props.onLoadSample} style={{ flex: 1 }}>
            Load sample trace
          </button>
          <button
            className="button ghost"
            onClick={() => props.onImportTrace(traceInput)}
            style={{ flex: 1 }}
          >
            Import pasted JSON
          </button>
        </div>
        <textarea
          className="input"
          rows={3}
          value={traceInput}
          onChange={(e) => setTraceInput(e.target.value)}
          placeholder='Paste an array of steps: [{ "label": "...", "state": {...}, "patches": [...] }]'
          style={{ resize: "vertical" }}
        />
        <div className="muted" style={{ fontSize: 12 }}>
          Tip: start with a log export from your agent; we render immediately to compare reuse and savings.
        </div>
        {props.importSummary && (
          <div className="muted" style={{ fontSize: 12, color: "#d1f5ff" }}>
            {props.importSummary}
          </div>
        )}
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
        <h4>Vector</h4>
        <div className="toggle-row">
          <div className="muted" style={{ fontSize: 12 }}>
            Semantic boost
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

