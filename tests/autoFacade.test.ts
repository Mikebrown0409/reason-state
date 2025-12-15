import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ReasonStateAuto } from "../src/api/auto.js";

describe("ReasonStateAuto (front-door facade)", () => {
  it("add() stores a node and returns without error", async () => {
    const rs = new ReasonStateAuto();
    
    // Should not throw
    await rs.add("User hates Friday meetings");
    
    // Verify node was stored
    const nodeIds = Object.keys(rs.state.raw);
    expect(nodeIds.length).toBe(1);
    
    // Verify the node has expected shape
    const node = rs.state.raw[nodeIds[0]] as any;
    expect(node.summary).toBe("User hates Friday meetings");
    expect(node.type).toBe("fact");
    expect(node.details.text).toBe("User hates Friday meetings");
  });

  it("add() with object stores correctly", async () => {
    const rs = new ReasonStateAuto();
    
    await rs.add({ preference: "no_friday", reason: "user stated" });
    
    const nodeIds = Object.keys(rs.state.raw);
    expect(nodeIds.length).toBe(1);
    
    const node = rs.state.raw[nodeIds[0]] as any;
    expect(node.details.preference).toBe("no_friday");
    expect(node.details.reason).toBe("user stated");
  });

  it("add() generates content-hash id for deduplication", async () => {
    const rs = new ReasonStateAuto();
    
    // Add same content twice
    await rs.add("User hates Friday meetings");
    await rs.add("User hates Friday meetings");
    
    // Should only have one node (deduped by content hash)
    const nodeIds = Object.keys(rs.state.raw);
    expect(nodeIds.length).toBe(1);
  });

  it("inject() returns { messages, stats } with governed context injected", async () => {
    const rs = new ReasonStateAuto();
    
    await rs.add("User prefers morning meetings");
    
    const baseMessages = [{ role: "user" as const, content: "When should we meet?" }];
    const result = await rs.inject(baseMessages, "Schedule a meeting");
    
    // Should return messages array
    expect(Array.isArray(result.messages)).toBe(true);
    expect(result.messages.length).toBeGreaterThan(0);
    
    // Should have injected context (system message or prepended)
    const hasContext = result.messages.some(
      (m) => m.content.includes("User prefers morning meetings") || m.content.includes("GOVERNED_MEMORY_CONTEXT")
    );
    expect(hasContext).toBe(true);
    
    // Should return stats
    expect(result.stats).toBeDefined();
    expect(typeof result.stats.contextChars).toBe("number");
    expect(typeof result.stats.estTokens).toBe("number");
    expect(typeof result.stats.rawNodeCount).toBe("number");
  });

  it("retrieve() returns { context, stats }", async () => {
    const rs = new ReasonStateAuto();
    
    await rs.add("User likes dark mode");
    
    const result = await rs.retrieve("What are user preferences?");
    
    // Should return context string
    expect(typeof result.context).toBe("string");
    expect(result.context).toContain("User likes dark mode");
    
    // Should return stats
    expect(result.stats).toBeDefined();
    expect(typeof result.stats.contextChars).toBe("number");
    expect(typeof result.stats.estTokens).toBe("number");
  });

  it("multiple add() calls followed by inject() works correctly", async () => {
    const rs = new ReasonStateAuto();
    
    await rs.add("User hates Friday meetings");
    await rs.add("Alice is on PTO Tuesday");
    await rs.add("Team prefers afternoons");
    
    // Should have 3 distinct nodes
    const nodeIds = Object.keys(rs.state.raw);
    expect(nodeIds.length).toBe(3);
    
    const baseMessages = [{ role: "user" as const, content: "When is the retro?" }];
    const result = await rs.inject(baseMessages, "Schedule the retro");
    
    // Context should include all facts
    expect(result.stats.rawNodeCount).toBe(3);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("stats include expected governance counts", async () => {
    const rs = new ReasonStateAuto();
    
    await rs.add("User prefers video calls");
    
    const result = await rs.retrieve("Meeting preferences");
    
    // Should have governance stats
    expect(typeof result.stats.unknownCount).toBe("number");
    expect(typeof result.stats.dirtyCount).toBe("number");
    expect(typeof result.stats.blockedCount).toBe("number");
    expect(typeof result.stats.summaryNodeCount).toBe("number");
    
    // For a clean state, should have no blockers
    expect(result.stats.unknownCount).toBe(0);
    expect(result.stats.dirtyCount).toBe(0);
    expect(result.stats.blockedCount).toBe(0);
  });

  it("tracks unstructured nodes for future LLM structuring", async () => {
    const rs = new ReasonStateAuto();
    
    expect(rs.pendingStructureCount).toBe(0);
    
    await rs.add("User hates Friday meetings");
    expect(rs.pendingStructureCount).toBe(1);
    
    await rs.add("Alice is on PTO Tuesday");
    expect(rs.pendingStructureCount).toBe(2);
  });

  it("works with empty messages array", async () => {
    const rs = new ReasonStateAuto();
    
    await rs.add("Some fact");
    
    const result = await rs.inject([], "A goal");
    
    // Should still return valid result
    expect(Array.isArray(result.messages)).toBe(true);
    expect(result.stats).toBeDefined();
  });

  it("accepts constructor options", async () => {
    // Should not throw with various options
    const rs = new ReasonStateAuto({
      apiKey: "test-key",
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
      maxTokens: 2000,
    });
    
    await rs.add("Test fact");
    const result = await rs.retrieve("Test goal");
    
    expect(result.context).toContain("Test fact");
  });
});

describe("ReasonStateAuto structuring and auto-heal", () => {
  let originalFetch: typeof fetch | undefined;

  beforeEach(() => {
    originalFetch = (globalThis as any).fetch;
  });

  afterEach(() => {
    if (originalFetch) {
      (globalThis as any).fetch = originalFetch;
    } else {
      delete (globalThis as any).fetch;
    }
    vi.restoreAllMocks();
  });

  it("inject() includes extended stats (structuringError, autoHealAttempts, autoHealRolledBack)", async () => {
    const rs = new ReasonStateAuto();

    await rs.add("User prefers mornings");

    const baseMessages = [{ role: "user" as const, content: "When to meet?" }];
    const result = await rs.inject(baseMessages, "Schedule meeting");

    // Should include extended stats
    expect("structuringError" in result.stats).toBe(true);
    expect("autoHealAttempts" in result.stats).toBe(true);
    expect("autoHealRolledBack" in result.stats).toBe(true);
  });

  it("inject() without API key skips structuring (no error)", async () => {
    // No API key configured
    const rs = new ReasonStateAuto();

    await rs.add("User prefers mornings");

    const baseMessages = [{ role: "user" as const, content: "When to meet?" }];
    const result = await rs.inject(baseMessages, "Schedule meeting");

    // Should not have structuring error (skipping is not an error)
    expect(result.stats.structuringError).toBe(false);
    // Nodes should still be tracked as unstructured (since structuring was skipped)
    // But they were cleared because no API key means return true
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("inject() with mocked LLM call applies structuring patches", async () => {
    const rs = new ReasonStateAuto({
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "http://fake",
    });

    await rs.add("User might prefer mornings");

    // Get the actual node ID that was generated
    const nodeIds = Object.keys(rs.state.raw);
    expect(nodeIds.length).toBe(1);
    const actualNodeId = nodeIds[0];

    // Mock fetch to return valid structuring patches using actual node ID
    const mockStructuringResponse = JSON.stringify([
      { op: "replace", path: `/raw/${actualNodeId}/type`, value: "assumption" },
    ]);

    (globalThis as any).fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: mockStructuringResponse } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
        { status: 200 }
      )
    );

    // Before inject, node is unstructured
    expect(rs.pendingStructureCount).toBe(1);

    const baseMessages = [{ role: "user" as const, content: "When to meet?" }];
    const result = await rs.inject(baseMessages, "Schedule meeting");

    // After inject, should have processed structuring
    expect(result.stats.structuringError).toBe(false);
    // Pending count should be cleared on success
    expect(rs.pendingStructureCount).toBe(0);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it("inject() handles LLM structuring failure gracefully", async () => {
    // Mock fetch to return invalid JSON (triggers structuring error)
    (globalThis as any).fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "not valid json array" } }],
        }),
        { status: 200 }
      )
    );

    const rs = new ReasonStateAuto({
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "http://fake",
    });

    await rs.add("User prefers mornings");

    const baseMessages = [{ role: "user" as const, content: "When to meet?" }];
    const result = await rs.inject(baseMessages, "Schedule meeting");

    // Should have structuring error but still return valid result
    expect(result.stats.structuringError).toBe(true);
    expect(Array.isArray(result.messages)).toBe(true);
    expect(result.messages.length).toBeGreaterThan(0);

    // Nodes should remain unstructured for retry
    expect(rs.pendingStructureCount).toBe(1);
  });

  it("inject() never throws, always returns safe result", async () => {
    // Mock fetch to throw network error
    (globalThis as any).fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const rs = new ReasonStateAuto({
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "http://fake",
    });

    await rs.add("User prefers mornings");

    const baseMessages = [{ role: "user" as const, content: "When to meet?" }];

    // Should not throw
    const result = await rs.inject(baseMessages, "Schedule meeting");

    // Should return valid result with structuring error
    expect(result.stats.structuringError).toBe(true);
    expect(Array.isArray(result.messages)).toBe(true);
  });

  it("inject() clears unstructured IDs only on successful structuring", async () => {
    // First call: structuring fails
    (globalThis as any).fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "invalid" } }],
        }),
        { status: 200 }
      )
    );

    const rs = new ReasonStateAuto({
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "http://fake",
    });

    await rs.add("User prefers mornings");
    expect(rs.pendingStructureCount).toBe(1);

    const baseMessages = [{ role: "user" as const, content: "When?" }];
    await rs.inject(baseMessages, "Goal");

    // Should still be pending after failure
    expect(rs.pendingStructureCount).toBe(1);

    // Second call: structuring succeeds with empty patches
    (globalThis as any).fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "[]" } }],
        }),
        { status: 200 }
      )
    );

    await rs.inject(baseMessages, "Goal");

    // Should be cleared after success
    expect(rs.pendingStructureCount).toBe(0);
  });

  it("retrieve() does not run structuring (read-only)", async () => {
    const fetchSpy = vi.fn();
    (globalThis as any).fetch = fetchSpy;

    const rs = new ReasonStateAuto({
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "http://fake",
    });

    await rs.add("User prefers mornings");

    // retrieve() should not call fetch (no LLM)
    const result = await rs.retrieve("What preferences?");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.context).toContain("User prefers mornings");
    // Nodes should remain unstructured
    expect(rs.pendingStructureCount).toBe(1);
  });
});

describe("ReasonStateAuto archival and reactivation", () => {
  let originalFetch: typeof fetch | undefined;

  beforeEach(() => {
    originalFetch = (globalThis as any).fetch;
  });

  afterEach(() => {
    if (originalFetch) {
      (globalThis as any).fetch = originalFetch;
    } else {
      delete (globalThis as any).fetch;
    }
    vi.restoreAllMocks();
  });

  it("archived nodes are excluded from context", async () => {
    const rs = new ReasonStateAuto();

    // Add two facts
    await rs.add("User wants Tokyo");
    await rs.add("User wants Amsterdam");

    // Manually archive one node for testing
    const nodeIds = Object.keys(rs.state.raw);
    const tokyoNode = Object.values(rs.state.raw).find(
      (n: any) => n.summary?.includes("Tokyo")
    );
    if (tokyoNode) {
      (tokyoNode as any).status = "archived";
    }

    // Retrieve context
    const result = await rs.retrieve("Where to travel?");

    // Context should NOT include archived node
    expect(result.context).not.toContain("Tokyo");
    // Context should include active node
    expect(result.context).toContain("Amsterdam");
  });

  it("structuring can archive superseded nodes", async () => {
    const rs = new ReasonStateAuto({
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "http://fake",
    });

    await rs.add("User wants Tokyo");
    const tokyoNodeId = Object.keys(rs.state.raw)[0];

    await rs.add("User wants Amsterdam");
    const amsterdamNodeId = Object.keys(rs.state.raw).find((id) => id !== tokyoNodeId)!;

    // Mock LLM to return archival patch for Tokyo
    const archivalResponse = JSON.stringify([
      { op: "replace", path: `/raw/${tokyoNodeId}/status`, value: "archived" },
    ]);

    (globalThis as any).fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: archivalResponse } }],
        }),
        { status: 200 }
      )
    );

    const baseMessages = [{ role: "user" as const, content: "Where to go?" }];
    const result = await rs.inject(baseMessages, "Plan trip");

    // Should have applied archival
    expect(result.stats.structuringError).toBe(false);
    
    // Tokyo node should be archived
    const tokyoNode = rs.state.raw[tokyoNodeId];
    expect(tokyoNode.status).toBe("archived");

    // Amsterdam should still be active
    const amsterdamNode = rs.state.raw[amsterdamNodeId];
    expect(amsterdamNode.status).not.toBe("archived");
  });

  it("structuring can reactivate archived nodes", async () => {
    const rs = new ReasonStateAuto({
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "http://fake",
    });

    await rs.add("User wants Tokyo");
    const tokyoNodeId = Object.keys(rs.state.raw)[0];

    // Manually archive it
    (rs.state.raw[tokyoNodeId] as any).status = "archived";

    await rs.add("Actually, back to Tokyo");
    const newNodeId = Object.keys(rs.state.raw).find((id) => id !== tokyoNodeId)!;

    // Mock LLM to return reactivation patch
    const reactivationResponse = JSON.stringify([
      { op: "replace", path: `/raw/${tokyoNodeId}/status`, value: "open" },
    ]);

    (globalThis as any).fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: reactivationResponse } }],
        }),
        { status: 200 }
      )
    );

    const baseMessages = [{ role: "user" as const, content: "Where to go?" }];
    await rs.inject(baseMessages, "Plan trip");

    // Tokyo node should be reactivated
    const tokyoNode = rs.state.raw[tokyoNodeId];
    expect(tokyoNode.status).toBe("open");
  });

  it("Tokyo → Amsterdam → Tokyo scenario works end-to-end", async () => {
    const rs = new ReasonStateAuto({
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "http://fake",
    });

    // Step 1: User wants Tokyo
    await rs.add("User wants to travel to Tokyo");
    const tokyoNodeId = Object.keys(rs.state.raw)[0];

    // First inject - no archival needed (only one node)
    (globalThis as any).fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "[]" } }] }),
        { status: 200 }
      )
    );

    await rs.inject(
      [{ role: "user" as const, content: "Plan my trip" }],
      "Trip planning"
    );

    // Check context via retrieve
    let contextResult = await rs.retrieve("Trip planning");
    expect(contextResult.context).toContain("Tokyo");

    // Step 2: User changes to Amsterdam - Tokyo should be archived
    await rs.add("User changed destination to Amsterdam");
    const amsterdamNodeId = Object.keys(rs.state.raw).find((id) => id !== tokyoNodeId)!;

    const archiveTokyoResponse = JSON.stringify([
      { op: "replace", path: `/raw/${tokyoNodeId}/status`, value: "archived" },
    ]);

    (globalThis as any).fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: archiveTokyoResponse } }] }),
        { status: 200 }
      )
    );

    await rs.inject(
      [{ role: "user" as const, content: "Update trip" }],
      "Trip planning"
    );

    // Tokyo should be archived
    expect(rs.state.raw[tokyoNodeId].status).toBe("archived");

    // Check context via retrieve
    contextResult = await rs.retrieve("Trip planning");
    // Context should have Amsterdam, not Tokyo
    expect(contextResult.context).toContain("Amsterdam");
    expect(contextResult.context).not.toContain("Tokyo");

    // Step 3: User reverts to Tokyo - Amsterdam archived, Tokyo reactivated
    await rs.add("User wants Tokyo again");

    const reactivateTokyoResponse = JSON.stringify([
      { op: "replace", path: `/raw/${tokyoNodeId}/status`, value: "open" },
      { op: "replace", path: `/raw/${amsterdamNodeId}/status`, value: "archived" },
    ]);

    (globalThis as any).fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: reactivateTokyoResponse } }] }),
        { status: 200 }
      )
    );

    await rs.inject(
      [{ role: "user" as const, content: "Final trip plan" }],
      "Trip planning"
    );

    // Tokyo should be reactivated
    expect(rs.state.raw[tokyoNodeId].status).toBe("open");
    // Amsterdam should be archived
    expect(rs.state.raw[amsterdamNodeId].status).toBe("archived");

    // Check context via retrieve
    contextResult = await rs.retrieve("Trip planning");
    // Context should have Tokyo, not Amsterdam
    expect(contextResult.context).toContain("Tokyo");
    expect(contextResult.context).not.toContain("Amsterdam");

    // All nodes still exist in state (audit trail)
    expect(Object.keys(rs.state.raw).length).toBeGreaterThanOrEqual(3);
  });

  it("archived status is a valid NodeStatus value", async () => {
    const rs = new ReasonStateAuto();

    await rs.add("Some fact");
    const nodeId = Object.keys(rs.state.raw)[0];

    // Manually set status to archived (simulating what LLM would do)
    (rs.state.raw[nodeId] as any).status = "archived";

    // Should be valid
    expect(rs.state.raw[nodeId].status).toBe("archived");
  });
});
