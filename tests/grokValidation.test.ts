import { describe, expect, it } from "vitest";
import { validateModelPatches } from "../src/tools/grokChat.js";
import { applyPatches } from "../src/engine/ReasonState.js";
import { createEmptyState } from "../src/engine/types.js";

describe("validateModelPatches", () => {
  it("rejects invalid op and raw writes", () => {
    const known = new Set<string>(["goal"]);
    expect(() =>
      validateModelPatches(
        JSON.stringify([
          { op: "delete", path: "/summary/goal", value: "x" },
          { op: "add", path: "/raw/new", value: { id: "new" } },
        ]),
        known
      )
    ).toThrow(/invalid op/i);
  });

  it("allows add and replace on summaries only", () => {
    const known = new Set<string>(["goal"]);
    const patches = validateModelPatches(
      JSON.stringify([
        { op: "replace", path: "/summary/goal", value: "updated goal" },
        { op: "add", path: "/summary/new", value: "new summary" },
      ]),
      known
    );
    expect(patches).toHaveLength(2);
  });
});

describe("applyPatches uuid assignment", () => {
  it("keeps path id and fills value.id when adding a node with unknown path id", () => {
    const state = createEmptyState();
    const result = applyPatches(
      [
        {
          op: "add",
          path: "/raw/temp-id",
          value: { type: "fact", summary: "temp" },
        },
      ],
      state
    );
    const keys = Object.keys(result.raw);
    expect(keys).toHaveLength(1);
    expect(keys[0]).toBe("temp-id");
    expect(result.raw[keys[0]].id).toBe(keys[0]);
  });

  it("throws on replace of unknown id", () => {
    const state = createEmptyState();
    expect(() =>
      applyPatches(
        [
          {
            op: "replace",
            path: "/raw/missing",
            value: { id: "missing" },
          },
        ],
        state
      )
    ).toThrow(/does not exist/i);
  });

  it("rejects raw node with unexpected field", () => {
    const state = createEmptyState();
    expect(() =>
      applyPatches(
        [
          {
            op: "add",
            path: "/raw/bad",
            value: { type: "fact", summary: "bad", extra: "nope" },
          },
        ],
        state
      )
    ).toThrow(/unexpected field/i);
  });

  it("rejects model patches that try to set details", () => {
    const known = new Set<string>(["goal"]);
    expect(() =>
      validateModelPatches(
        JSON.stringify([
          { op: "add", path: "/raw/goal", value: { id: "goal", details: { foo: "bar" } } },
        ]),
        known
      )
    ).toThrow(/summaries only|may not write to \/raw/i);
  });

  it("rejects summary value that is not a string", () => {
    const state = createEmptyState();
    expect(() =>
      applyPatches(
        [
          {
            op: "add",
            path: "/summary/s1",
            value: { not: "string" },
          },
        ],
        state
      )
    ).toThrow(/summary value must be string/i);
  });

  it("rejects replace on missing summary id", () => {
    const known = new Set<string>(["goal"]);
    expect(() =>
      validateModelPatches(
        JSON.stringify([{ op: "replace", path: "/summary/missing", value: "x" }]),
        known
      )
    ).toThrow(/replace must target existing id/i);
  });

  it("rejects summary replace when id not in state", () => {
    const state = createEmptyState();
    expect(() =>
      applyPatches(
        [
          {
            op: "replace",
            path: "/summary/missing",
            value: "should fail",
          },
        ],
        state
      )
    ).toThrow(/does not exist/i);
  });
});
