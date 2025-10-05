import { describe, test, expect, beforeEach, mock } from "bun:test";
import { StreamManager } from "./streamManager";
import type { HistoryService } from "./historyService";
import type { PartialService } from "./partialService";
import { createAnthropic } from "@ai-sdk/anthropic";
import { shouldRunIntegrationTests, validateApiKeys } from "@/tests/testUtils";

// Skip integration tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

// Validate API keys before running tests
if (shouldRunIntegrationTests()) {
  validateApiKeys(["ANTHROPIC_API_KEY"]);
}

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

  // Integration test - requires API key and TEST_INTEGRATION=1
  describeIntegration("with real API", () => {
    test("should prevent concurrent streams for the same workspace", async () => {
      const workspaceId = "test-workspace-concurrent";
      const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const model = anthropic("claude-sonnet-4-5");

      // Track when streams are actively processing
      const streamStates: Record<string, { started: boolean; finished: boolean }> = {};

      streamManager.on("stream-start", (data: { messageId: string }) => {
        streamStates[data.messageId] = { started: true, finished: false };
      });

      streamManager.on("stream-end", (data: { messageId: string }) => {
        if (streamStates[data.messageId]) {
          streamStates[data.messageId].finished = true;
        }
      });

      streamManager.on("stream-abort", (data: { messageId: string }) => {
        if (streamStates[data.messageId]) {
          streamStates[data.messageId].finished = true;
        }
      });

      // Start first stream
      const result1 = await streamManager.startStream(
        workspaceId,
        [{ role: "user", content: "Say hello and nothing else" }],
        model,
        "anthropic:claude-sonnet-4-5",
        1,
        "You are a helpful assistant",
        undefined,
        {}
      );

      expect(result1.success).toBe(true);
      const firstMessageId = result1.success ? result1.data : "";

      // Wait for first stream to actually start
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Start second stream - should cancel first
      const result2 = await streamManager.startStream(
        workspaceId,
        [{ role: "user", content: "Say goodbye and nothing else" }],
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

      // Verify: first stream should have been cancelled before second stream started
      expect(streamStates[firstMessageId]).toBeDefined();
      expect(streamStates[firstMessageId].started).toBe(true);
      expect(streamStates[firstMessageId].finished).toBe(true);

      // Verify no streams are active after completion
      expect(streamManager.isStreaming(workspaceId)).toBe(false);
    }, 10000);
  });

  // Unit test - doesn't require API key
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
