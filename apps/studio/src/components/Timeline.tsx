import React from "react";
import type { StudioStep } from "../sampleTrace";

type Props = {
  steps: StudioStep[];
  active: number;
  onSelect: (idx: number) => void;
};

export function Timeline(props: Props) {
  return (
    <div className="carousel">
      {props.steps.map((step, idx) => (
        <div
          key={idx}
          className={`card ${props.active === idx ? "active" : ""}`}
          onClick={() => props.onSelect(idx)}
        >
          <h3>{step.label}</h3>
          <div className="muted">Patches: {step.patches.length}</div>
          <div className="chips-row" style={{ marginTop: 8 }}>
            {Object.values(step.state.raw)
              .slice(0, 6)
              .map((node) => (
                <div
                  key={node.id}
                  className={`node-chip ${node.status === "blocked" ? "blocked" : ""} ${
                    node.dirty ? "dirty" : ""
                  }`}
                >
                  {node.type}: {node.summary ?? node.id}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

