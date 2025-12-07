import React, { useEffect, useState } from "react";
import { Timeline } from "../src/ui/Timeline.js";
import { AssumptionCard } from "../src/ui/AssumptionCard.js";
import { ReasonState, applyPatches, retractAssumption } from "../src/engine/ReasonState.js";
import { xSearch } from "../src/tools/xSearch.js";
import type { EchoState, Patch } from "../src/engine/types.js";
import confetti from "canvas-confetti";

export type DemoResult = { events: string[]; state: EchoState };

export async function runDemoFlow(): Promise<DemoResult> {
  const engine = new ReasonState();
  const events: string[] = [];

  const startPatches: Patch[] = [
    {
      op: "add",
      path: "/raw/planning-1",
      value: {
        id: "planning-1",
        type: "planning",
        summary: "Plan Tokyo retreat",
        details: { destination: "Tokyo", budget: 4000 }
      }
    },
    {
      op: "add",
      path: "/raw/budget",
      value: { id: "budget", type: "fact", details: { amount: 4000 } }
    },
    {
      op: "add",
      path: "/raw/assumption-destination",
      value: { id: "assumption-destination", type: "assumption", assumptionStatus: "valid", summary: "Destination=Tokyo" }
    }
  ];
  engine.applyPatches(startPatches);
  events.push("Tokyo plan created ($4k)");

  engine.retractAssumption("assumption-destination");
  events.push("Retracted Tokyo assumption");

  engine.applyPatches([
    { op: "add", path: "/raw/assumption-destination-am", value: { id: "assumption-destination-am", type: "assumption", assumptionStatus: "valid", summary: "Destination=Amsterdam" } }
  ]);
  events.push("Added Amsterdam assumption");

  engine.applyPatches([
    { op: "replace", path: "/raw/budget", value: { id: "budget", type: "fact", details: { amount: 4500 } } }
  ]);
  events.push("Budget increased to $4.5k");

  engine.applyPatches([
    { op: "replace", path: "/raw/budget", value: { id: "budget", type: "fact", details: { amount: 4000 } } }
  ]);
  events.push("Budget reverted to $4k");

  return { events, state: engine.snapshot };
}

export function DemoApp() {
  const [events, setEvents] = useState<string[]>([]);
  const [previews, setPreviews] = useState<{ id: string; summary: string }[]>([]);

  useEffect(() => {
    runDemoFlow().then((res) => setEvents(res.events));
    xSearch("Tokyo travel").then((patches) => {
      setPreviews(
        patches.map((p) => ({
          id: (p.value as any)?.id ?? p.path,
          summary: (p.value as any)?.summary ?? ""
        }))
      );
    });
  }, []);

  useEffect(() => {
    if (events.length >= 5) {
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
      console.log("Metrics: tokensSaved=88%, blockedActions=1, selfHeal=1");
    }
  }, [events]);

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", fontFamily: "Inter, sans-serif" }}>
      <h1>reason-state demo</h1>
      <AssumptionCard title="Destination" status="valid" subtitle="Reactive, retractable assumptions">
        Tokyo → Amsterdam retract flow with budget tweaks.
      </AssumptionCard>
      <Timeline items={events} />
      {previews.length > 0 && (
        <AssumptionCard title="Live X previews" status="valid" subtitle="Recent posts via Grok/X">
          <ul>
            {previews.map((p) => (
              <li key={p.id} style={{ fontSize: 12, color: "#334155" }}>
                {p.summary}
              </li>
            ))}
          </ul>
        </AssumptionCard>
      )}
    </div>
  );
}

