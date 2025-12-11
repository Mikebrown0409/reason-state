import type { EchoState, Patch } from "../../../../src/engine/types.js";

export type StudioStep = {
  label: string;
  state: EchoState;
  patches: Patch[];
};

const baseState = (): EchoState => ({
  raw: {},
  summary: {},
  assumptions: [],
  unknowns: [],
  history: [],
});

const step1State = baseState();
step1State.raw = {
  goal: { id: "goal", type: "planning", summary: "Schedule weekly retro", status: "open" },
  friday: { id: "friday", type: "fact", summary: "User hates meetings on Friday", status: "open" },
  retro: {
    id: "retro",
    type: "fact",
    summary: "Team retro is Monday 10am PT",
    status: "open",
  },
  pto: { id: "pto", type: "assumption", summary: "Alice is on PTO Tuesday", status: "open" },
};

const step2State: EchoState = {
  ...step1State,
  history: [...step1State.history],
};
step2State.raw = {
  ...step1State.raw,
  pto: { ...step1State.raw.pto, status: "blocked", assumptionStatus: "retracted", dirty: true },
};

const patches1: Patch[] = [
  { op: "add", path: "/summary/goal", value: "Goal: When should we schedule the retro?" },
  { op: "add", path: "/summary/friday", value: "fact: User hates meetings on Friday" },
  { op: "add", path: "/summary/retro", value: "fact: Team retro is Monday 10am PT" },
  { op: "add", path: "/summary/pto", value: "assumption: Alice is on PTO Tuesday" },
];

const patches2: Patch[] = [
  { op: "replace", path: "/summary/pto", value: "assumption retracted: Alice PTO canceled" },
];

const step3State: EchoState = {
  ...step2State,
  history: [...step2State.history],
};
step3State.raw = {
  ...step2State.raw,
  venue: { id: "venue", type: "fact", summary: "Venue booked: Monday 10am PT", status: "open" },
};

const patches3: Patch[] = [
  { op: "add", path: "/summary/venue", value: "fact: Venue booked for Monday 10am PT" },
];

export const sampleTrace: StudioStep[] = [
  { label: "Turn 1 — Plan", state: step1State, patches: patches1 },
  { label: "Turn 2 — Retract", state: step2State, patches: patches2 },
  { label: "Turn 3 — Book", state: step3State, patches: patches3 },
];

