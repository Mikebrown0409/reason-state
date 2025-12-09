import { ReasonState } from "../engine/ReasonState.js";
import type { EchoState, Patch, ReasonStateOptions, StateNode } from "../engine/types.js";
import { planAndAct, type PlanAndActInput, type PlanAndActResult } from "../agent/planAndAct.js";
import { buildRollbackPatches } from "../engine/reconciliation.js";

export type FacadeOptions = ReasonStateOptions;

function clone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

export function addNode(
  node: StateNode,
  options: FacadeOptions = {},
  initialState?: EchoState
): EchoState {
  const engine = new ReasonState(options, initialState ? clone(initialState) : undefined);
  const patches: Patch[] = [{ op: "add", path: `/raw/${node.id}`, value: node }];
  if (node.summary) {
    patches.push({
      op: engine.snapshot.summary?.[node.id] ? "replace" : "add",
      path: `/summary/${node.id}`,
      value: node.summary,
    });
  }
  engine.applyPatches(patches);
  return clone(engine.snapshot);
}

export function updateNode(
  nodeId: string,
  value: Partial<StateNode>,
  options: FacadeOptions = {},
  initialState?: EchoState
): EchoState {
  const engine = new ReasonState(options, initialState ? clone(initialState) : undefined);
  const current = engine.snapshot.raw[nodeId];
  const next = { ...(current ?? {}), ...value, id: nodeId };
  const patches: Patch[] = [
    { op: current ? "replace" : "add", path: `/raw/${nodeId}`, value: next },
  ];
  if (value.summary) {
    patches.push({
      op: engine.snapshot.summary?.[nodeId] ? "replace" : "add",
      path: `/summary/${nodeId}`,
      value: value.summary as string,
    });
  }
  engine.applyPatches(patches);
  return clone(engine.snapshot);
}

export async function recompute(
  params: Omit<PlanAndActInput, "initialState"> & { initialState?: EchoState }
): Promise<PlanAndActResult> {
  return planAndAct(params);
}

export function rollbackSubtree(
  nodeId: string,
  options: FacadeOptions = {},
  initialState?: EchoState
): EchoState {
  const engine = new ReasonState(options, initialState ? clone(initialState) : undefined);
  const patches = buildRollbackPatches(engine.snapshot, nodeId);
  if (patches.length > 0) {
    engine.applyPatches(patches);
  }
  return clone(engine.snapshot);
}
