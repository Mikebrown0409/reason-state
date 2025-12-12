export type Stats = {
  contextChars: number;
  estTokens: number;
  unknownCount: number;
  dirtyCount: number;
  blockedCount: number;
};

export type RetrieveResult = {
  context: string;
  stats: Stats;
};

export type MemoryRunner = {
  name: string;
  add: (key: string, value: string) => Promise<void> | void;
  update: (key: string, value: string) => Promise<void> | void;
  retract: (key: string) => Promise<void> | void;
  retrieve: (goal: string) => Promise<RetrieveResult> | RetrieveResult;
};

export type ScenarioStep =
  | { op: "add"; key: string; value: string }
  | { op: "update"; key: string; value: string }
  | { op: "retract"; key: string }
  | {
      op: "query";
      goal: string;
      expectContains?: string[];
      expectExcludes?: string[];
    };

export type Scenario = {
  id: string;
  title: string;
  steps: ScenarioStep[];
};


