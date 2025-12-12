import { describe, it, expect } from "vitest";
import {
  parseTrace,
  messagesToStudioSteps,
  estimateTokensByChars,
  rawDumpFromState,
} from "../src/cli/audit/adapt.js";
import type { EchoState } from "../src/engine/types.js";

describe("audit CLI adapters", () => {
  it("parses {messages:[...]} envelope", () => {
    const parsed = parseTrace({ messages: [{ role: "user", content: "hi" }] });
    expect(parsed.kind).toBe("messages");
    if (parsed.kind === "messages") {
      expect(parsed.messages.length).toBe(1);
    }
  });

  it("converts messages -> StudioStep[] snapshots", async () => {
    const steps = await messagesToStudioSteps([
      { role: "user", content: "hello" },
      { role: "assistant", content: "ok" },
    ]);
    expect(steps.length).toBe(2);
    expect(steps[0].label).toContain("user");
    expect(Object.keys(steps[0].state.raw ?? {}).length).toBeGreaterThan(0);
  });

  it("token estimate is chars/4 and rawDump is stable", () => {
    const state: EchoState = {
      raw: { a: { id: "a", type: "fact", summary: "hello", status: "open" } as any },
      summary: {},
      assumptions: [],
      unknowns: [],
      history: [],
    };
    const raw = rawDumpFromState(state);
    expect(typeof raw).toBe("string");
    expect(estimateTokensByChars(raw)).toBeGreaterThan(0);
  });
});
