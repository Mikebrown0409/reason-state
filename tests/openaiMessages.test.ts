import { describe, it, expect } from "vitest";
import { injectMemoryContext, type ChatMessage } from "../src/integrations/openaiMessages.js";

describe("injectMemoryContext", () => {
  it("does not mutate the input messages", async () => {
    const rs = {
      retrieve: async () => ({
        context: "A\nB",
        stats: {
          contextChars: 3,
          estTokens: 1,
          rawNodeCount: 0,
          summaryNodeCount: 0,
          unknownCount: 0,
          dirtyCount: 0,
          blockedCount: 0,
        },
      }),
    };

    const input: ChatMessage[] = [
      { role: "system", content: "SYS" },
      { role: "user", content: "U1" },
    ];
    const before = JSON.stringify(input);
    const out = await injectMemoryContext(rs, input, { goal: "g" });
    expect(JSON.stringify(input)).toBe(before);
    expect(out.messages).not.toBe(input);
    expect(out.messages[0].role).toBe("system");
    expect(out.messages[0].content).toContain("GOVERNED_MEMORY_CONTEXT:");
    expect(out.stats.contextChars).toBe(3);
  });

  it("supports prepend-user strategy", async () => {
    const rs = {
      retrieve: async () => ({
        context: "CTX",
        stats: {
          contextChars: 3,
          estTokens: 1,
          rawNodeCount: 0,
          summaryNodeCount: 0,
          unknownCount: 0,
          dirtyCount: 0,
          blockedCount: 0,
        },
      }),
    };

    const input: ChatMessage[] = [
      { role: "system", content: "SYS" },
      { role: "user", content: "hello" },
    ];

    const out = await injectMemoryContext(rs, input, { goal: "g", strategy: "prepend-user" });
    expect(out.messages[1].role).toBe("user");
    expect(out.messages[1].content).toContain("CTX");
    expect(out.messages[1].content).toContain("hello");
  });
});
