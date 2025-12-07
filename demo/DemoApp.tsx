import React, { useEffect, useState } from "react";
import { Timeline } from "../src/ui/Timeline.js";
import { AssumptionCard } from "../src/ui/AssumptionCard.js";
import { ReasonState } from "../src/engine/ReasonState.js";
import type { EchoState, Patch } from "../src/engine/types.js";
import { runSimpleAgent as runDemoAgent } from "../examples/agents/simpleAgent.js";
import { runDagAgent } from "../examples/agents/dagAgent.js";
import { planAndAct } from "../src/agent/planAndAct.js";
import { resetCalendarHolds } from "../src/tools/mockBooking.js";
import confetti from "canvas-confetti";

type HistoryEntry = { state: EchoState; label: string; idx: number };

export function DemoApp() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [idx, setIdx] = useState(0);
  const current = history[idx] ?? history[history.length - 1];
  const [plan, setPlan] = useState<string>("");
  const [planMeta, setPlanMeta] = useState<{ attempts?: number; lastError?: string; raw?: string }>();
  const [planMetaHistory, setPlanMetaHistory] = useState<Array<{ attempts?: number; lastError?: string; raw?: string; label?: string }>>(
    []
  );
  const [events, setEvents] = useState<string[]>([]);
  const [query, setQuery] = useState("Tokyo");
  const [budget, setBudget] = useState(4000);
  const [replayResult, setReplayResult] = useState<string>("");
  const [factInput, setFactInput] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [timeline, setTimeline] = useState<string[]>([]);
  const [reusedCount, setReusedCount] = useState(0);
  const [regeneratedCount, setRegeneratedCount] = useState(0);
  const [reusedIds, setReusedIds] = useState<string[]>([]);
  const [regeneratedIds, setRegeneratedIds] = useState<string[]>([]);
  const [patchLog, setPatchLog] = useState<Patch[]>([]);
  const [blockedBookings, setBlockedBookings] = useState(0);
  const [resolvedBookings, setResolvedBookings] = useState(0);
  const [showPatchLog, setShowPatchLog] = useState(false);
  const [showModelContext, setShowModelContext] = useState(false);
  const [agentMessage, setAgentMessage] = useState<string>("");
  const [planMessages, setPlanMessages] = useState<string[]>([]);
  const [agentMode, setAgentMode] = useState<"simple" | "dag">("simple");
  const [replayStatus, setReplayStatus] = useState<string>("");
  const [tokenSavings, setTokenSavings] = useState<string>("");
  const [rollbackTarget, setRollbackTarget] = useState<string>("");
  const [diffBefore, setDiffBefore] = useState<Record<string, any> | null>(null);
  const [diffAfter, setDiffAfter] = useState<Record<string, any> | null>(null);
  const [lastRecomputedId, setLastRecomputedId] = useState<string>("");
  const [changedNodes, setChangedNodes] = useState<string[]>([]);
  const [replayInfo, setReplayInfo] = useState<{ patches: number; rawMatch: boolean; summaryMatch: boolean }>();
  const [lastRunMode, setLastRunMode] = useState<"normal" | "semantic" | "temporal">("normal");
  const [lastRunLabel, setLastRunLabel] = useState<string>("");

  const markDependentsDirty = (state: EchoState | undefined) => {
    if (!state) return state;
    const clone = JSON.parse(JSON.stringify(state)) as EchoState;
    const raw = clone.raw ?? {};
    Object.values(raw).forEach((node: any) => {
      if (node.type === "action" || node.type === "planning") {
        node.dirty = true;
        node.updatedAt = new Date().toISOString();
      }
    });
    return clone;
  };

  const runLive = (rollbackId?: string, mode: "normal" | "semantic" | "temporal" = "normal") => {
    const q = query;
    const b = budget;
    const injected = factInput ? [{ summary: factInput }] : [];
    const snapshotBefore = current?.state ? JSON.parse(JSON.stringify(current.state.raw)) : null;
    const initialState = mode === "semantic" ? markDependentsDirty(current?.state) : current?.state;
    setLastRunMode(mode);
    setLastRunLabel(mode === "semantic" ? "Semantic recompute" : mode === "temporal" ? "Temporal rollback" : "Run");
    const runner =
      agentMode === "dag"
        ? runDagAgent(
            q,
            b,
            injected,
            {
              bookingDates: startDate && endDate ? { startDate, endDate } : undefined,
              useX: false,
              rollbackNodeId: rollbackId
            },
            initialState
          )
        : planAndAct({
            goal: q,
            budget: b,
            facts: injected,
            bookingDates: startDate && endDate ? { startDate, endDate } : undefined,
            initialState
          });
    runner.then((res) => {
      const withIdx = res.history.map((h, i) => ({ ...h, idx: i }));
      setHistory(withIdx);
      setIdx(withIdx.length - 1);
      setPlan(res.plan ?? "");
      setPlanMeta(res.planMeta);
      setPlanMetaHistory(res.planMetaHistory ?? []);
      setPlanMessages(res.planMessages ?? []);
      setAgentMessage(res.agentMessage ?? "");
      setEvents(res.events);
      setTimeline((prev) => [...prev, `Turn ${res.history.length}: ${res.events.join(" | ")}`]);
      const latest = res.history[res.history.length - 1]?.state;
      setPatchLog(latest?.history ?? []);
      const bookings = Object.values(latest?.raw ?? {}).filter((n) => n.type === "action");
      setBlockedBookings(bookings.filter((b) => b.status === "blocked").length);
      setResolvedBookings(bookings.filter((b) => b.status === "resolved").length);
      if (res.history.length >= 2) {
        const last = res.history[res.history.length - 1].state;
        const prevState = res.history[res.history.length - 2].state;
        const lastIds = new Set(Object.keys(last.raw));
        const prevIds = new Set(Object.keys(prevState.raw));
        let reused = 0;
        const reusedList: string[] = [];
        lastIds.forEach((id) => {
          if (prevIds.has(id) && JSON.stringify(last.raw[id]) === JSON.stringify(prevState.raw[id])) {
            reused++;
            reusedList.push(id);
          }
        });
        setReusedCount(reused);
        setRegeneratedCount(lastIds.size - reused);
        const regeneratedList = Array.from(lastIds).filter((id) => !reusedList.includes(id));
        setReusedIds(reusedList);
        setRegeneratedIds(regeneratedList);
        const total = lastIds.size;
        const savings = total ? Math.round((reused / total) * 100) : 0;
        setTokenSavings(`${savings}% reused (token/time savings proxy)`);
      } else {
        setReusedCount(0);
        setRegeneratedCount(0);
        setReusedIds([]);
        setRegeneratedIds([]);
        setTokenSavings("");
      }
      if (snapshotBefore) {
        setDiffBefore(snapshotBefore);
      }
      const latestRaw = res.history[res.history.length - 1]?.state.raw;
      if (latestRaw) {
        const afterClone = JSON.parse(JSON.stringify(latestRaw));
        setDiffAfter(afterClone);
        if (snapshotBefore) {
          const keys = new Set([...Object.keys(snapshotBefore ?? {}), ...Object.keys(afterClone ?? {})]);
          const changed = Array.from(keys).filter((k) => JSON.stringify(snapshotBefore?.[k]) !== JSON.stringify(afterClone?.[k]));
          setChangedNodes(changed);
        } else {
          setChangedNodes([]);
        }
      }
      if (rollbackId) setLastRecomputedId(rollbackId);
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
    const summaryMatch = JSON.stringify(engine.snapshot.summary) === JSON.stringify(current.state.summary);
    setReplayResult(match && summaryMatch ? "Determinism check: OK (raw+summary match)" : "Determinism check: MISMATCH");
    setReplayStatus(match && summaryMatch ? "Replay OK" : "Replay mismatch");
    setReplayInfo({
      patches: current.state.history?.length ?? 0,
      rawMatch: match,
      summaryMatch
    });
  };

  const recentPatches = (current?.state.history ?? []).slice(-8).reverse();
  const contextSnapshot = Object.entries(current?.state.summary ?? {})
    .map(([id, summary]) => `- ${id}: ${summary}`)
    .join("\n");
  const hasBlocked = blockedBookings > 0 || unknowns.length > 0 || dirtyNodes.length > 0;
  const nodeChips = Object.values(current?.state.raw ?? {}).map((n) => ({
    id: n.id,
    type: n.type,
    status: n.status ?? "open",
    dirty: Boolean(n.dirty),
    dependsOn: n.dependsOn ?? [],
    temporalAfter: (n as any).temporalAfter ?? [],
    temporalBefore: (n as any).temporalBefore ?? []
  }));

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", fontFamily: "Inter, sans-serif", padding: 16, display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <h1 style={{ margin: 0 }}>ReasonState — Governed Memory & Replay</h1>
          <span
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              background: hasBlocked ? "#fee2e2" : "#dcfce7",
              color: hasBlocked ? "#b91c1c" : "#166534",
              fontSize: 12,
              border: "1px solid #e5e7eb"
            }}
          >
            {hasBlocked ? "Blocked" : "Clean"}
          </span>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
          <select value={agentMode} onChange={(e) => setAgentMode(e.target.value as "simple" | "dag")} style={{ padding: 6 }}>
            <option value="simple">Simple agent</option>
            <option value="dag">DAG agent</option>
          </select>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Destination / goal" style={{ padding: 6, flex: 1, minWidth: 160 }} />
        <input
          type="number"
          value={budget}
          onChange={(e) => setBudget(Number(e.target.value))}
          placeholder="Budget"
          style={{ padding: 6, width: 120 }}
        />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            placeholder="Start"
            style={{ padding: 6, width: 150 }}
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            placeholder="End"
            style={{ padding: 6, width: 150 }}
          />
        <input
          value={factInput}
          onChange={(e) => setFactInput(e.target.value)}
          placeholder="Optional new fact / assumption"
            style={{ padding: 6, flex: 1, minWidth: 160 }}
        />
          <button onClick={() => runLive()} style={{ padding: "6px 12px" }}>
            Run
        </button>
          {agentMode === "simple" && (
            <button onClick={() => runLive(undefined, "semantic")} style={{ padding: "6px 12px" }}>
              Recompute (new facts)
            </button>
          )}
        <button
          onClick={() => {
              resetCalendarHolds();
              setHistory([]);
              setIdx(0);
              setPlan("");
              setPlanMeta(undefined);
              setPlanMetaHistory([]);
              setEvents([]);
              setTimeline([]);
              setReplayResult("");
              setReusedCount(0);
              setRegeneratedCount(0);
              setPatchLog([]);
              setBlockedBookings(0);
              setResolvedBookings(0);
              setReusedIds([]);
              setRegeneratedIds([]);
          }}
          style={{ padding: "6px 12px" }}
        >
            Reset
        </button>
      </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <AssumptionCard title="Metrics" status="valid" subtitle="Run-level">
            <div style={{ fontSize: 12, color: "#334155", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
            <div>Grok plan length: {plan.length}</div>
            <div>Blocked actions: {events.filter((e) => e.toLowerCase().includes("blocked")).length}</div>
            <div>Unknowns: {unknowns.length}</div>
            <div>Dirty nodes: {dirtyNodes.length}</div>
              <div>Reused nodes: {reusedCount}</div>
              <div>Regenerated: {regeneratedCount}</div>
              <div>Bookings: {resolvedBookings} resolved / {blockedBookings} blocked</div>
              {tokenSavings && <div style={{ gridColumn: "span 2" }}>{tokenSavings}</div>}
              {planMeta && (
                <div style={{ gridColumn: "span 2" }}>
                  Grok validation: attempts {planMeta.attempts ?? "?"}
                  {planMeta.lastError ? ` (last error: ${planMeta.lastError})` : ""}
          </div>
              )}
            </div>
          </AssumptionCard>
          <AssumptionCard title="Governance" status="valid" subtitle="Blocked vs clean">
            <div style={{ fontSize: 12, color: hasBlocked ? "#b91c1c" : "#0f172a" }}>
              {hasBlocked ? (
                <>
                  {blockedBookings > 0 && <div>Booking blocked (clash)</div>}
                  {unknowns.length > 0 && <div>Unknowns: {unknowns.join(", ")}</div>}
                  {dirtyNodes.length > 0 && <div>Dirty: {dirtyNodes.map((n) => n.id).join(", ")}</div>}
                </>
              ) : (
                <div>Clean: actions allowed</div>
          )}
            <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center", flexWrap: "wrap" }}>
              <button style={{ padding: "4px 8px" }} onClick={checkReplay}>
                Replay & verify
              </button>
              {replayStatus && (
                <span
                  style={{
                    padding: "2px 8px",
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    background: replayStatus.includes("OK") ? "#dcfce7" : "#fee2e2",
                    color: replayStatus.includes("OK") ? "#166534" : "#b91c1c",
                    fontSize: 12
                  }}
                >
                  {replayStatus}
                </span>
              )}
            </div>
            {replayResult && <div style={{ fontSize: 12, marginTop: 4 }}>{replayResult}</div>}
            {replayInfo && (
              <div style={{ fontSize: 12, marginTop: 4, color: "#334155" }}>
                <div>Log length: {replayInfo.patches} patches</div>
                <div>Raw match: {replayInfo.rawMatch ? "yes" : "no"}</div>
                <div>Summary match: {replayInfo.summaryMatch ? "yes" : "no"}</div>
              </div>
            )}
        </div>
          </AssumptionCard>
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
          <Timeline items={timelineLabels} />
      </div>

      {plan && (
        <AssumptionCard title="Grok plan" status="valid" subtitle="Generated live">
            {planMessages.length > 0 ? (
              <ul style={{ fontSize: 13, color: "#0f172a" }}>
                {planMessages.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            ) : (
              <div style={{ fontSize: 13, color: "#0f172a", whiteSpace: "pre-wrap" }}>{plan}</div>
            )}
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

        {agentMessage && (
          <AssumptionCard title="Agent response" status="valid" subtitle="Model-guided next step">
            <div style={{ fontSize: 13, color: "#0f172a" }}>{agentMessage}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              {hasBlocked && (
                <button
                  style={{ padding: "4px 8px" }}
                  onClick={() => {
                    const blockedId =
                      Object.values(current?.state.raw ?? {}).find((n) => n.type === "action" && n.status === "blocked")?.id ??
                      rollbackTarget;
                    runLive(agentMode === "dag" ? blockedId : undefined, "temporal");
                  }}
                >
                  Rollback & recompute (temporal/tool)
                </button>
              )}
              {dirtyNodes.length > 0 && (
                <button
                  style={{ padding: "4px 8px" }}
                  onClick={() => {
                    runLive(undefined, "semantic");
                  }}
                >
                  Recompute affected plan (new facts)
                </button>
              )}
            </div>
          </AssumptionCard>
        )}

        {diffBefore && diffAfter && (
          <AssumptionCard title="Subtree diff" status="valid" subtitle={`Before → After (${lastRunLabel || "last run"})`}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>
                  Before (raw){lastRecomputedId ? ` — subtree ${lastRecomputedId}` : ""}
                </div>
                <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto", color: "#0f172a" }}>
                  {JSON.stringify(diffBefore, null, 2)}
                </pre>
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>
                  After (raw){lastRecomputedId ? ` — subtree ${lastRecomputedId}` : ""}
                </div>
                <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", maxHeight: 160, overflow: "auto", color: "#0f172a" }}>
                  {JSON.stringify(diffAfter, null, 2)}
                </pre>
              </div>
            </div>
            {changedNodes.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 12, color: "#0f172a" }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Changed nodes</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {changedNodes.map((id) => (
                    <span
                      key={id}
                      style={{ padding: "2px 6px", borderRadius: 8, background: "#e0f2fe", border: "1px solid #bae6fd" }}
                    >
                      {id}
                    </span>
                  ))}
                </div>
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

        <AssumptionCard title="Recent patches" status="valid" subtitle="Last 8">
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

        <AssumptionCard title="What the model saw" status="valid" subtitle="Summaries-only context snapshot">
          <button style={{ fontSize: 12, marginBottom: 6 }} onClick={() => setShowModelContext((s) => !s)}>
            {showModelContext ? "Hide" : "Show"} context
          </button>
          {showModelContext && <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", color: "#0f172a" }}>{contextSnapshot || "No summaries"}</pre>}
        </AssumptionCard>

        <AssumptionCard title="Reuse vs regenerated" status="valid" subtitle="Per-turn reuse">
          <div style={{ display: "flex", gap: 12, fontSize: 12, color: "#0f172a" }}>
            <div>
              <div style={{ fontWeight: 600 }}>Reused</div>
              {reusedIds.length === 0 ? <div>None</div> : <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{reusedIds.map((id) => <span key={id} style={{ padding: "2px 6px", borderRadius: 8, background: "#dcfce7", border: "1px solid #bbf7d0" }}>{id}</span>)}</div>}
            </div>
            <div>
              <div style={{ fontWeight: 600 }}>Regenerated</div>
              {regeneratedIds.length === 0 ? <div>None</div> : <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{regeneratedIds.map((id) => <span key={id} style={{ padding: "2px 6px", borderRadius: 8, background: "#eff6ff", border: "1px solid #bfdbfe" }}>{id}</span>)}</div>}
            </div>
          </div>
        </AssumptionCard>

        <AssumptionCard title="Patch log (all)" status="valid" subtitle="Append-only patches with source/timestamps">
          <button style={{ fontSize: 12, marginBottom: 6 }} onClick={() => setShowPatchLog((s) => !s)}>
            {showPatchLog ? "Hide log" : "Show log"}
          </button>
          {showPatchLog && (
            <>
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
            </>
          )}
        </AssumptionCard>
      </div>

      <div>
        <AssumptionCard title="Node status" status="valid" subtitle="Chips with status/deps">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {nodeChips.map((n) => (
              <div
                key={n.id}
                style={{
                  padding: "6px 10px",
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  background: n.status === "blocked" ? "#fee2e2" : n.dirty ? "#fef9c3" : "#dcfce7",
                  color: "#0f172a",
                  fontSize: 12
                }}
              >
                <div style={{ fontWeight: 600 }}>{n.id}</div>
                <div>{n.type} {n.status}{n.dirty ? " (dirty)" : ""}</div>
                {(n.dependsOn.length > 0 || n.temporalAfter.length > 0 || n.temporalBefore.length > 0) && (
                  <div style={{ marginTop: 2 }}>
                    {n.dependsOn.length > 0 && <div>depends: {n.dependsOn.join(", ")}</div>}
                    {n.temporalAfter.length > 0 && <div>after: {n.temporalAfter.join(", ")}</div>}
                    {n.temporalBefore.length > 0 && <div>before: {n.temporalBefore.join(", ")}</div>}
                  </div>
                )}
                {agentMode === "dag" && (
                  <div style={{ marginTop: 4 }}>
                    <button
                      style={{ fontSize: 11, padding: "2px 6px", borderRadius: 8, border: "1px solid #e2e8f0" }}
                      onClick={() => {
                        setRollbackTarget(n.id);
                        runLive(n.id);
                      }}
                    >
                      Rollback & recompute
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </AssumptionCard>

        <AssumptionCard title="State JSON" status="valid" subtitle="Snapshot (raw + summary)">
          <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", color: "#0f172a", maxHeight: 220, overflow: "auto" }}>
            {JSON.stringify(current?.state, null, 2)}
          </pre>
      </AssumptionCard>
      </div>
    </div>
  );
}

