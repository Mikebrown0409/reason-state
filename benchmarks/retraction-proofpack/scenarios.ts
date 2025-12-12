import type { Scenario } from "./types.js";

export const scenarios: Scenario[] = [
  {
    id: "travel_pivot",
    title: "Travel pivot: Tokyo → retract → Amsterdam",
    steps: [
      { op: "add", key: "trip:destination_tokyo", value: "Destination: Tokyo" },
      { op: "query", goal: "Where is the trip?", expectContains: ["Tokyo"] },
      { op: "retract", key: "trip:destination_tokyo" },
      { op: "add", key: "trip:destination_amsterdam", value: "Destination: Amsterdam" },
      { op: "query", goal: "Where is the trip?", expectContains: ["Amsterdam"], expectExcludes: ["Tokyo"] },
    ],
  },
  {
    id: "budget_revision",
    title: "Budget revision: $4k → retract → $2k",
    steps: [
      { op: "add", key: "trip:budget_4k", value: "Budget: $4,000" },
      { op: "query", goal: "What is the budget?", expectContains: ["$4,000"] },
      { op: "retract", key: "trip:budget_4k" },
      { op: "add", key: "trip:budget_2k", value: "Budget: $2,000" },
      { op: "query", goal: "What is the budget?", expectContains: ["$2,000"], expectExcludes: ["$4,000"] },
    ],
  },
  {
    id: "policy_toggle",
    title: "Policy toggle: no Fridays added then removed",
    steps: [
      { op: "add", key: "policy:no_fridays", value: "Policy: no meetings on Friday" },
      { op: "query", goal: "Any scheduling constraints?", expectContains: ["no meetings on Friday"] },
      { op: "retract", key: "policy:no_fridays" },
      { op: "query", goal: "Any scheduling constraints?", expectExcludes: ["no meetings on Friday"] },
    ],
  },
  {
    id: "tool_result_corrected",
    title: "Tool output corrected: API result changed",
    steps: [
      { op: "add", key: "tool:weather_v1", value: "Weather API: rain tomorrow" },
      { op: "query", goal: "What is the weather?", expectContains: ["rain tomorrow"] },
      { op: "retract", key: "tool:weather_v1" },
      { op: "add", key: "tool:weather_v2", value: "Weather API: clear tomorrow" },
      { op: "query", goal: "What is the weather?", expectContains: ["clear tomorrow"], expectExcludes: ["rain tomorrow"] },
    ],
  },
  {
    id: "preference_conflict",
    title: "Preference conflict resolved: short answers vs long answers",
    steps: [
      { op: "add", key: "pref:short", value: "User prefers short answers" },
      { op: "query", goal: "How should you respond?", expectContains: ["short answers"] },
      { op: "add", key: "pref:long", value: "User prefers long answers" },
      { op: "query", goal: "How should you respond?", expectContains: ["long answers"] },
      { op: "retract", key: "pref:long" },
      { op: "query", goal: "How should you respond?", expectContains: ["short answers"], expectExcludes: ["long answers"] },
    ],
  },
  {
    id: "shipping_address_update",
    title: "Shipping address update: old address must not remain in context",
    steps: [
      { op: "add", key: "ship:addr_old", value: "Shipping address: 12 Main St" },
      { op: "query", goal: "What is the shipping address?", expectContains: ["12 Main St"] },
      { op: "retract", key: "ship:addr_old" },
      { op: "add", key: "ship:addr_new", value: "Shipping address: 90 Market St" },
      { op: "query", goal: "What is the shipping address?", expectContains: ["90 Market St"], expectExcludes: ["12 Main St"] },
    ],
  },
  {
    id: "meeting_time_change",
    title: "Meeting time change: keep latest, exclude old time",
    steps: [
      { op: "add", key: "retro:time_old", value: "Retro time: Monday 10am PT" },
      { op: "query", goal: "When is retro?", expectContains: ["Monday 10am"] },
      { op: "retract", key: "retro:time_old" },
      { op: "add", key: "retro:time_new", value: "Retro time: Tuesday 11am PT" },
      { op: "query", goal: "When is retro?", expectContains: ["Tuesday 11am"], expectExcludes: ["Monday 10am"] },
    ],
  },
  {
    id: "destination_flipflop",
    title: "Destination flip-flop: ensure old destinations are excluded",
    steps: [
      { op: "add", key: "trip:dest_tokyo", value: "Destination: Tokyo" },
      { op: "retract", key: "trip:dest_tokyo" },
      { op: "add", key: "trip:dest_berlin", value: "Destination: Berlin" },
      { op: "query", goal: "Where is the trip?", expectContains: ["Berlin"], expectExcludes: ["Tokyo"] },
      { op: "retract", key: "trip:dest_berlin" },
      { op: "add", key: "trip:dest_amsterdam", value: "Destination: Amsterdam" },
      { op: "query", goal: "Where is the trip?", expectContains: ["Amsterdam"], expectExcludes: ["Berlin", "Tokyo"] },
    ],
  },
];


