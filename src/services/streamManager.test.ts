import { describe, test, expect, beforeEach, mock } from "bun:test";
import { StreamManager } from "./streamManager";
import type { HistoryService } from "./historyService";
import type { PartialService } from "./partialService";
import { createAnthropic } from "@ai-sdk/anthropic";

// Mock HistoryService
const createMockHistoryService = (): HistoryService => {
  return {
    appendToHistory: mock(() => Promise.resolve({ success: true })),
    getHistory: mock(() => Promise.resolve({ success: true, data: [] })),
    updateHistory: mock(() => Promise.resolve({ success: true })),
    truncateAfterMessage: mock(() => Promise.resolve({ success: true })),
    clearHistory: mock(() => Promise.resolve({ success: true })),
  } as unknown as HistoryService;
};

// Mock PartialService
const createMockPartialService = (): PartialService => {
  return {
    writePartial: mock(() => Promise.resolve({ success: true })),
    readPartial: mock(() => Promise.resolve(null)),
    deletePartial: mock(() => Promise.resolve({ success: true })),
    commitToHistory: mock(() => Promise.resolve({ success: true })),
  } as unknown as PartialService;
};

describe("StreamManager - Concurrent Stream Prevention", () => {
  let streamManager: StreamManager;
  let mockHistoryService: HistoryService;
  let mockPartialService: PartialService;

  beforeEach(() => {
    mockHistoryService = createMockHistoryService();
    mockPartialService = createMockPartialService();
    streamManager = new StreamManager(mockHistoryService, mockPartialService);
  });

  test("should prevent concurrent streams for the same workspace", async () => {
    // This test requires a real API key to test actual streaming behavior
    // Skip if ANTHROPIC_API_KEY is not set
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log("Skipping concurrent stream test - ANTHROPIC_API_KEY not set");
      return;
    }

    const workspaceId = "test-workspace-concurrent";
    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const model = anthropic("claude-sonnet-4-5");

    // Track stream start/end events
    const events: Array<{ type: string; messageId: string; timestamp: number }> = [];

    streamManager.on("stream-start", (data: { messageId: string }) => {
      events.push({ type: "start", messageId: data.messageId, timestamp: Date.now() });
    });

    streamManager.on("stream-end", (data: { messageId: string }) => {
      events.push({ type: "end", messageId: data.messageId, timestamp: Date.now() });
    });

    streamManager.on("stream-abort", (data: { messageId: string }) => {
      events.push({ type: "abort", messageId: data.messageId, timestamp: Date.now() });
    });

    // Start first stream (long-running message)
    const result1 = await streamManager.startStream(
      workspaceId,
      [{ role: "user", content: "Count from 1 to 100 slowly" }],
      model,
      "anthropic:claude-sonnet-4-5",
      1,
      "You are a helpful assistant",
      undefined,
      {}
    );

    expect(result1.success).toBe(true);

    // Wait a bit to let first stream start processing
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Start second stream immediately (should cancel first)
    const result2 = await streamManager.startStream(
      workspaceId,
      [{ role: "user", content: "Say hello" }],
      model,
      "anthropic:claude-sonnet-4-5",
      2,
      "You are a helpful assistant",
      undefined,
      {}
    );

    expect(result2.success).toBe(true);

    // Wait for second stream to complete
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Verify event ordering:
    // 1. First stream should start
    // 2. First stream should abort (not end naturally)
    // 3. Second stream should start AFTER first stream aborts
    // 4. Second stream should end naturally

    const startEvents = events.filter((e) => e.type === "start");
    const abortEvents = events.filter((e) => e.type === "abort");
    const endEvents = events.filter((e) => e.type === "end");

    // Should have two start events (one for each stream)
    expect(startEvents.length).toBe(2);

    // First stream should have been aborted
    expect(abortEvents.length).toBeGreaterThanOrEqual(1);

    // Second stream should have completed
    expect(endEvents.length).toBeGreaterThanOrEqual(1);

    // Verify temporal ordering: first stream starts, then aborts, then second stream starts
    const firstStart = startEvents[0];
    const firstAbort = abortEvents.find((e) => e.messageId === firstStart.messageId);
    const secondStart = startEvents[1];

    if (firstAbort) {
      // First stream should abort before second stream starts
      expect(firstAbort.timestamp).toBeLessThan(secondStart.timestamp);
    }

    // Verify no concurrent streams: only one stream should be active at any time
    // We can check this by ensuring the manager reports not streaming after completion
    expect(streamManager.isStreaming(workspaceId)).toBe(false);
  }, 10000);

  test("should serialize multiple rapid startStream calls", async () => {
    // This is a simpler test that doesn't require API key
    // It tests the mutex behavior without actually streaming

    const workspaceId = "test-workspace-serial";

    // Track the order of operations
    const operations: string[] = [];

    // Mock ensureStreamSafety to track when it's called
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    const originalEnsure = (streamManager as any).ensureStreamSafety.bind(streamManager);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (streamManager as any).ensureStreamSafety = async (wsId: string) => {
      operations.push("ensure-start");
      await new Promise((resolve) => setTimeout(resolve, 50));
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
      const result = await originalEnsure(wsId);
      operations.push("ensure-end");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return result;
    };

    // Create a dummy model (won't actually be used since we're mocking the core behavior)
    const anthropic = createAnthropic({ apiKey: "dummy-key" });
    const model = anthropic("claude-sonnet-4-5");

    // Start three streams rapidly
    // Without mutex, these would interleave (ensure-start, ensure-start, ensure-start, ensure-end, ensure-end, ensure-end)
    // With mutex, they should be serialized (ensure-start, ensure-end, ensure-start, ensure-end, ensure-start, ensure-end)
    const promises = [
      streamManager.startStream(
        workspaceId,
        [{ role: "user", content: "test 1" }],
        model,
        "anthropic:claude-sonnet-4-5",
        1,
        "system",
        undefined,
        {}
      ),
      streamManager.startStream(
        workspaceId,
        [{ role: "user", content: "test 2" }],
        model,
        "anthropic:claude-sonnet-4-5",
        2,
        "system",
        undefined,
        {}
      ),
      streamManager.startStream(
        workspaceId,
        [{ role: "user", content: "test 3" }],
        model,
        "anthropic:claude-sonnet-4-5",
        3,
        "system",
        undefined,
        {}
      ),
    ];

    // Wait for all to complete (they will fail due to dummy API key, but that's ok)
    await Promise.allSettled(promises);

    // Verify operations are serialized: each ensure-start should be followed by its ensure-end
    // before the next ensure-start
    for (let i = 0; i < operations.length - 1; i += 2) {
      if (operations[i] === "ensure-start") {
        expect(operations[i + 1]).toBe("ensure-end");
      }
    }
  });
});
