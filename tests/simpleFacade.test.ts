import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ReasonStateSimple } from "../src/api/simple.js";

describe("ReasonStateSimple", () => {
  const fakePatches = `[{"op":"add","path":"/summary/answer","value":"Use Mondays"}]`;
  let originalFetch: typeof fetch | undefined;

  beforeEach(() => {
    originalFetch = (globalThis as any).fetch;
    (globalThis as any).fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: fakePatches } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { status: 200 }
      )
    );
  });

  afterEach(() => {
    if (originalFetch) {
      (globalThis as any).fetch = originalFetch;
    } else {
      delete (globalThis as any).fetch;
    }
    vi.restoreAllMocks();
  });

  it("adds, updates, and applies planner patches via query", async () => {
    const rs = new ReasonStateSimple({
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "http://fake",
      fetcher: (globalThis as any).fetch,
      maxTokens: 500,
    });

    await rs.add("User hates meetings on Friday");
    const id = Object.keys(rs.state.raw)[0];
    await rs.update(id, { retracted: true, reason: "New policy" });

    const { patches, state } = await rs.query("When should we schedule the retro?");

    expect(patches.length).toBeGreaterThan(0);
    expect(state.summary["answer"]).toBe("Use Mondays");
    expect((state.raw[id] as any).assumptionStatus).toBe("retracted");

    const fetchMock = (globalThis as any).fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns pruned context in retrieve mode without calling the planner", async () => {
    const rs = new ReasonStateSimple({
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "http://fake",
      fetcher: (globalThis as any).fetch,
      maxTokens: 100,
    });

    await rs.add("User prefers dark mode");
    const res = await rs.query("What theme?", { mode: "retrieve" });

    expect(res.context).toBeTruthy();
    expect(res.patches.length).toBe(0);

    const fetchMock = (globalThis as any).fetch as ReturnType<typeof vi.fn>;
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});

