import React, { useMemo, useState } from "react";
import type { StudioStep } from "../sampleTrace";
import { buildContext } from "../../../../src/context/contextBuilder.js";

type Props = {
  steps: StudioStep[];
  active: number;
};

export function RightPanel({ steps, active }: Props) {
  const [tab, setTab] = useState<"log" | "context" | "diff">("log");
  const step = steps[active];
  const prev = steps[active - 1];

  const context = useMemo(() => {
    try {
      return buildContext(step.state, { includeTimeline: true, maxChars: 1200 });
    } catch (e) {
      return String(e);
    }
  }, [step]);

  const diff = useMemo(() => {
    if (!prev) return JSON.stringify(step.state.raw, null, 2);
    const changed: Record<string, unknown> = {};
    for (const [id, node] of Object.entries(step.state.raw)) {
      const prior = prev.state.raw[id];
      if (JSON.stringify(prior) !== JSON.stringify(node)) {
        changed[id] = node;
      }
    }
    return JSON.stringify(changed, null, 2);
  }, [step, prev]);

  return (
    <div className="panel right">
      <div className="tab-header">
        {["log", "context", "diff"].map((t) => (
          <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t as any)}>
            {t === "log" ? "Replay log" : t === "context" ? "What the model saw" : "State diff"}
          </button>
        ))}
      </div>

      {tab === "log" && (
        <div className="log">
          {step.patches.map((p, idx) => (
            <div key={idx}>{`#${idx} ${p.op} ${p.path}${p.reason ? ` (${p.reason})` : ""}`}</div>
          ))}
          {step.patches.length === 0 && <div className="muted">No patches on this step.</div>}
        </div>
      )}

      {tab === "context" && <pre className="json-box">{context}</pre>}

      {tab === "diff" && <pre className="json-box">{diff}</pre>}
    </div>
  );
}

