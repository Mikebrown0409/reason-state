import { describe, it, expect } from "vitest";
import { applyPatches } from "../src/engine/ReasonState.js";
import { createEmptyState } from "../src/engine/types.js";

describe("node shape validation", () => {
  it("accepts valid raw and summary patches", () => {
    const state = createEmptyState();
    const result = applyPatches(
      [
        {
          op: "add",
          path: "/raw/fact-1",
          value: {
            id: "fact-1",
            type: "fact",
            summary: "ok",
            details: { a: 1 },
            status: "open"
          }
        },
        { op: "add", path: "/summary/fact-1", value: "ok" }
      ],
      state
    );
    expect(result.raw["fact-1"].summary).toBe("ok");
    expect(result.summary["fact-1"]).toBe("ok");
  });

  it("rejects invalid node type", () => {
    const state = createEmptyState();
    expect(() =>
      applyPatches(
        [
          {
            op: "add",
            path: "/raw/bad-type",
            value: { id: "bad-type", type: "weird", summary: "nope" }
          }
        ],
        state
      )
    ).toThrow(/invalid node type/i);
  });

  it("rejects invalid status", () => {
    const state = createEmptyState();
    expect(() =>
      applyPatches(
        [
          {
            op: "add",
            path: "/raw/bad-status",
            value: { id: "bad-status", type: "fact", status: "planned" }
          }
        ],
        state
      )
    ).toThrow(/invalid status/i);
  });

  it("rejects invalid assumptionStatus", () => {
    const state = createEmptyState();
    expect(() =>
      applyPatches(
        [
          {
            op: "add",
            path: "/raw/bad-assumption",
            value: { id: "bad-assumption", type: "assumption", assumptionStatus: "made-up" }
          }
        ],
        state
      )
    ).toThrow(/invalid assumptionStatus/i);
  });

  it("rejects details that are not an object", () => {
    const state = createEmptyState();
    expect(() =>
      applyPatches(
        [
          {
            op: "add",
            path: "/raw/bad-details",
            value: { id: "bad-details", type: "fact", details: "not-object" }
          }
        ],
        state
      )
    ).toThrow(/details must be an object/i);
  });

  it("rejects raw with extra unexpected fields", () => {
    const state = createEmptyState();
    expect(() =>
      applyPatches(
        [
          {
            op: "add",
            path: "/raw/bad-extra",
            value: { id: "bad-extra", type: "fact", summary: "x", extra: "nope" }
          }
        ],
        state
      )
    ).toThrow(/unexpected field/i);
  });

  it("rejects raw when value.id mismatches path id", () => {
    const state = createEmptyState();
    expect(() =>
      applyPatches(
        [
          {
            op: "add",
            path: "/raw/mismatch",
            value: { id: "other", type: "fact" }
          }
        ],
        state
      )
    ).toThrow(/value.id must match path id/i);
  });

  it("rejects non-string summary value", () => {
    const state = createEmptyState();
    expect(() =>
      applyPatches(
        [
          {
            op: "add",
            path: "/summary/s1",
            value: { not: "string" }
          }
        ],
        state
      )
    ).toThrow(/summary value must be string/i);
  });
});

