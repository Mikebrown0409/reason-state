import React, { useEffect, useState } from "react";
import { Timeline } from "../src/ui/Timeline.js";
import { AssumptionCard } from "../src/ui/AssumptionCard.js";
import { ReasonState } from "../src/engine/ReasonState.js";
import type { EchoState, Patch } from "../src/engine/types.js";
import { runSimpleAgent as runDemoAgent } from "../examples/agents/simpleAgent.js";
import confetti from "canvas-confetti";

type HistoryEntry = { state: EchoState; label: string; idx: number };

function diffNodes(prev?: EchoState, curr?: EchoState): string[] {
  if (!prev || !curr) return [];
  const changed: string[] = [];
  const ids = new Set([...Object.keys(prev.raw), ...Object.keys(curr.raw)]);
  ids.forEach((id) => {
    const a = prev.raw[id];
    const b = curr.raw[id];
    if (JSON.stringify(a) !== JSON.stringify(b)) changed.push(id);
  });
  return changed;
}

export function DemoApp() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [idx, setIdx] = useState(0);
  const current = history[idx] ?? history[history.length - 1];
  const prev = history[idx - 1];
  const changed = diffNodes(prev?.state, current?.state);
  const [plan, setPlan] = useState<string>("");
  const [planMeta, setPlanMeta] = useState<{ attempts?: number; lastError?: string; raw?: string }>();
  const [planMetaHistory, setPlanMetaHistory] = useState<Array<{ attempts?: number; lastError?: string; raw?: string; label?: string }>>(
    []
  );
  const [events, setEvents] = useState<string[]>([]);
  const [query, setQuery] = useState("Tokyo");
  const [budget, setBudget] = useState(4000);
  const [replayResult, setReplayResult] = useState<string>("");
  const [turn, setTurn] = useState(1);
  const [factInput, setFactInput] = useState("");
  const [timeline, setTimeline] = useState<string[]>([]);
  const [reusedCount, setReusedCount] = useState(0);
  const [regeneratedCount, setRegeneratedCount] = useState(0);
  const [patchLog, setPatchLog] = useState<Patch[]>([]);
  const [blockedBookings, setBlockedBookings] = useState(0);
  const [resolvedBookings, setResolvedBookings] = useState(0);

  useEffect(() => {
    runLive();
  }, []);

  const runLive = () => {
    runDemoAgent(query, budget, factInput ? [{ summary: factInput }] : []).then((res) => {
      const withIdx = res.history.map((h, i) => ({ ...h, idx: i }));
      setHistory(withIdx);
      setIdx(withIdx.length - 1);
      setPlan(res.plan ?? "");
      setPlanMeta(res.planMeta);
      setPlanMetaHistory(res.planMetaHistory ?? []);
      setEvents(res.events);
      setTimeline((prev) => [...prev, `Turn ${turn}: ${res.events.join(" | ")}`]);
      const allPatches = res.history.flatMap((h) => h.state.history ?? []);
      setPatchLog(allPatches);
      const bookings = Object.values(res.history[res.history.length - 1].state.raw ?? {}).filter((n) => n.type === "action");
      setBlockedBookings(bookings.filter((b) => b.status === "blocked").length);
      setResolvedBookings(bookings.filter((b) => b.status === "resolved").length);
      if (res.history.length >= 2) {
        const last = res.history[res.history.length - 1].state;
        const prevState = res.history[res.history.length - 2].state;
        const lastIds = new Set(Object.keys(last.raw));
        const prevIds = new Set(Object.keys(prevState.raw));
        let reused = 0;
        lastIds.forEach((id) => {
          if (prevIds.has(id) && JSON.stringify(last.raw[id]) === JSON.stringify(prevState.raw[id])) reused++;
        });
        setReusedCount(reused);
        setRegeneratedCount(lastIds.size - reused);
      } else {
        setReusedCount(0);
        setRegeneratedCount(0);
      }
    });
  };

  useEffect(() => {
    if (history.length >= 3) {
      confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
    }
  }, [history.length]);

  const handleAssumptionClick = (id: string) => {
    const currState = current?.state;
    if (!currState || !currState.raw[id]) return;
    const node = currState.raw[id];
    const engine = new ReasonState({}, currState);
    engine.retractAssumption(id);
    const newState: HistoryEntry = { state: JSON.parse(JSON.stringify(engine.snapshot)), label: `Retracted ${id}`, idx: history.length };
    setHistory((prevHist) => [...prevHist.slice(0, idx + 1), newState]);
    setIdx(history.length);
  };

  const assumptions = Object.values(current?.state.raw ?? {}).filter((n) => n.type === "assumption" && n.assumptionStatus !== "retracted");
  const timelineLabels = history.slice(0, idx + 1).map((h) => h.label);

  const unknowns = current?.state.unknowns ?? [];
  const dirtyNodes = Object.values(current?.state.raw ?? {}).filter((n) => n.dirty);

  const checkReplay = () => {
    if (!current?.state) return;
    const engine = new ReasonState();
    engine.applyPatches(current.state.history ?? []);
    const match = JSON.stringify(engine.snapshot.raw) === JSON.stringify(current.state.raw);
    setReplayResult(match ? "Determinism check: OK" : "Determinism check: MISMATCH");
  };

  const recentPatches = (current?.state.history ?? []).slice(-8).reverse();
  const contextSnapshot = Object.entries(current?.state.summary ?? {})
    .map(([id, summary]) => `- ${id}: ${summary}`)
    .join("\n");

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", fontFamily: "Inter, sans-serif", padding: 16 }}>
      <h1>reason-state time machine</h1>

      <div style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Query" style={{ padding: 6, flex: 1 }} />
        <input
          type="number"
          value={budget}
          onChange={(e) => setBudget(Number(e.target.value))}
          placeholder="Budget"
          style={{ padding: 6, width: 120 }}
        />
        <input
          value={factInput}
          onChange={(e) => setFactInput(e.target.value)}
          placeholder="Optional new fact / assumption"
          style={{ padding: 6, flex: 1 }}
        />
        <button onClick={runLive} style={{ padding: "6px 12px" }}>
          Run agent
        </button>
        <button
          onClick={() => {
            setTurn((t) => t + 1);
            runLive();
          }}
          style={{ padding: "6px 12px" }}
        >
          New turn
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, background: "#f8fafc", padding: 10, borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <div style={{ fontWeight: 600 }}>Metrics</div>
          <div style={{ fontSize: 12, color: "#334155" }}>
            <div>X posts used: {(current?.state.history ?? []).filter((p) => (p as any).value?.type === "assumption").length}</div>
            <div>Grok plan length: {plan.length}</div>
            <div>Blocked actions: {events.filter((e) => e.toLowerCase().includes("blocked")).length}</div>
            <div>Self-heal events: {events.filter((e) => e.toLowerCase().includes("self-heal")).length}</div>
            <div>Unknowns: {unknowns.length}</div>
            <div>Dirty nodes: {dirtyNodes.length}</div>
            <div>Reused nodes: {reusedCount}</div>
            <div>Regenerated nodes: {regeneratedCount}</div>
            <div>Bookings: {resolvedBookings} resolved / {blockedBookings} blocked</div>
            {planMeta && (
              <div>
                Grok validation: attempts {planMeta.attempts ?? "?"}
                {planMeta.lastError ? ` (last error: ${planMeta.lastError})` : ""}
              </div>
            )}
          </div>
        </div>
        <div style={{ flex: 1, background: "#f8fafc", padding: 10, borderRadius: 8, border: "1px solid #e2e8f0" }}>
          <div style={{ fontWeight: 600 }}>Governance</div>
          {unknowns.length > 0 || dirtyNodes.length > 0 ? (
            <div style={{ fontSize: 12, color: "#b91c1c" }}>
              {unknowns.length > 0 && <div>Blocked: unknowns present ({unknowns.join(", ")})</div>}
              {dirtyNodes.length > 0 && <div>Dirty nodes: {dirtyNodes.map((n) => n.id).join(", ")}</div>}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "#0f172a" }}>Clean: actions allowed</div>
          )}
          <button style={{ marginTop: 6, padding: "4px 8px" }} onClick={checkReplay}>
            Check determinism
          </button>
          {replayResult && <div style={{ fontSize: 12, marginTop: 4 }}>{replayResult}</div>}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 4 }}>
          Timeline step: {idx + 1} / {history.length}
        </label>
        <input
          type="range"
          min={0}
          max={Math.max(history.length - 1, 0)}
          value={idx}
          onChange={(e) => setIdx(Number(e.target.value))}
          style={{ width: "100%" }}
        />
        <button style={{ marginTop: 6 }} onClick={() => setIdx(history.length - 1)}>
          Jump to now
        </button>
      </div>

      <Timeline items={timelineLabels} />
      {timeline.length > 0 && (
        <AssumptionCard title="Turn log" status="valid" subtitle="Events per turn">
          <ul style={{ fontSize: 12, color: "#334155" }}>
            {timeline.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </AssumptionCard>
      )}

      {plan && (
        <AssumptionCard title="Grok plan" status="valid" subtitle="Generated live">
          <div style={{ fontSize: 13, color: "#0f172a", whiteSpace: "pre-wrap" }}>{plan}</div>
          {planMetaHistory.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: "#334155" }}>
              <div style={{ fontWeight: 600 }}>Validation/backoff</div>
              <ul>
                {planMetaHistory.map((m, i) => (
                  <li key={i}>
                    {m.label ?? `Attempt ${i + 1}`}: attempts={m.attempts ?? "?"}
                    {m.lastError ? ` lastError=${m.lastError}` : ""}{" "}
                    {m.raw ? (
                      <details>
                        <summary>raw</summary>
                        <pre style={{ whiteSpace: "pre-wrap" }}>{m.raw}</pre>
                      </details>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </AssumptionCard>
      )}

      <AssumptionCard title="Assumptions" status="valid" subtitle="Click to retract and replay">
        {assumptions.length === 0 ? (
          <div style={{ fontSize: 12, color: "#64748b" }}>No active assumptions</div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {assumptions.map((a) => (
              <button
                key={a.id}
                onClick={() => handleAssumptionClick(a.id)}
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: 12,
                  padding: "6px 10px",
                  background: "#f8fafc",
                  cursor: "pointer"
                }}
              >
                {a.summary ?? a.id}
              </button>
            ))}
          </div>
        )}
      </AssumptionCard>

      <AssumptionCard title="State" status="valid" subtitle="Current node summaries">
        <ul style={{ fontSize: 12, color: "#334155" }}>
          {Object.values(current?.state.raw ?? {}).map((n) => (
            <li key={n.id}>
              <strong>{n.id}</strong> [{n.type}] {n.status ?? ""} {n.dirty ? "(dirty)" : ""}{" "}
              {n.assumptionStatus ? `[${n.assumptionStatus}]` : ""}{" "}
              {n.sourceType ? `(source: ${n.sourceType}${n.sourceId ? `/${n.sourceId}` : ""})` : ""} {n.summary ? `— ${n.summary}` : ""}
            </li>
          ))}
        </ul>
      </AssumptionCard>

      <AssumptionCard title="Event log (patches)" status="valid" subtitle="Recent patches applied">
        {recentPatches.length === 0 ? (
          <div style={{ fontSize: 12, color: "#64748b" }}>No patches</div>
        ) : (
          <ul style={{ fontSize: 12, color: "#334155" }}>
            {recentPatches.map((p, i) => (
              <li key={`${p.path}-${i}`}>
                {p.op} {p.path} {p.reason ? `(${p.reason})` : ""}{" "}
                {(p as any).value?.sourceType ? `[src: ${(p as any).value.sourceType}${(p as any).value.sourceId ? `/${(p as any).value.sourceId}` : ""}]` : ""}
              </li>
            ))}
          </ul>
        )}
      </AssumptionCard>

      <AssumptionCard title="Patch log (all)" status="valid" subtitle="Append-only patches with source/timestamps">
        {patchLog.length === 0 ? (
          <div style={{ fontSize: 12, color: "#64748b" }}>No patches</div>
        ) : (
          <ul style={{ fontSize: 12, color: "#334155", maxHeight: 200, overflow: "auto" }}>
            {[...patchLog].reverse().map((p, i) => {
              const val = (p as any).value as any;
              return (
                <li key={`${p.path}-${i}`}>
                  {p.op} {p.path} {p.reason ? `(${p.reason})` : ""}{" "}
                  {val?.status ? `[status=${val.status}]` : ""}{" "}
                  {val?.createdAt ? `[created=${val.createdAt}]` : ""} {val?.updatedAt ? `[updated=${val.updatedAt}]` : ""}{" "}
                  {val?.sourceType ? `[src: ${val.sourceType}${val.sourceId ? `/${val.sourceId}` : ""}]` : ""}
                </li>
              );
            })}
          </ul>
        )}
      </AssumptionCard>

      <AssumptionCard title="What the model saw" status="valid" subtitle="Summaries-only context snapshot">
        <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", color: "#0f172a" }}>{contextSnapshot || "No summaries"}</pre>
      </AssumptionCard>

      <AssumptionCard title="Diff (previous → current)" status="valid" subtitle="Changed nodes on last step">
        {changed.length === 0 ? (
          <div style={{ fontSize: 12, color: "#64748b" }}>No changes</div>
        ) : (
          <ul style={{ fontSize: 12, color: "#334155" }}>
            {changed.map((id) => {
              const prevNode = prev?.state.raw[id];
              const currNode = current?.state.raw[id];
              return (
                <li key={id}>
                  <strong>{id}</strong>
                  <div>Prev: {prevNode?.summary ?? JSON.stringify(prevNode)}</div>
                  <div>Curr: {currNode?.summary ?? JSON.stringify(currNode)}</div>
                </li>
              );
            })}
          </ul>
        )}
      </AssumptionCard>
    </div>
  );
}

