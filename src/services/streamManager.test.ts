import { describe, test, expect, beforeEach, mock } from "bun:test";
import { StreamManager } from "./streamManager";
import type { HistoryService } from "./historyService";
import type { PartialService } from "./partialService";
import { createAnthropic } from "@ai-sdk/anthropic";
import { shouldRunIntegrationTests, validateApiKeys } from "../../tests/testUtils";

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
    // Suppress error events from bubbling up as uncaught exceptions during tests
    streamManager.on("error", () => undefined);
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

    // Create a dummy model (won't actually be used since we're mocking the core behavior)
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    interface WorkspaceStreamInfoStub {
      state: string;
      streamResult: {
        fullStream: AsyncGenerator<unknown, void, unknown>;
        usage: Promise<unknown>;
        providerMetadata: Promise<unknown>;
      };
      abortController: AbortController;
      messageId: string;
      token: string;
      startTime: number;
      model: string;
      initialMetadata?: Record<string, unknown>;
      historySequence: number;
      parts: unknown[];
      lastPartialWriteTime: number;
      partialWriteTimer?: ReturnType<typeof setTimeout>;
      partialWritePromise?: Promise<void>;
      processingPromise: Promise<void>;
    }

    const ensureStreamSafetyValue = Reflect.get(streamManager, "ensureStreamSafety") as unknown;
    if (typeof ensureStreamSafetyValue !== "function") {
      throw new Error("StreamManager.ensureStreamSafety is unavailable for testing");
    }

    const originalEnsure = (
      ensureStreamSafetyValue as (workspaceId: string) => Promise<string>
    ).bind(streamManager);

    const replaceEnsureResult = Reflect.set(
      streamManager,
      "ensureStreamSafety",
      async (wsId: string): Promise<string> => {
        operations.push("ensure-start");
        await new Promise((resolve) => setTimeout(resolve, 50));
        const result = await originalEnsure(wsId);
        operations.push("ensure-end");
        return result;
      }
    );

    if (!replaceEnsureResult) {
      throw new Error("Failed to mock StreamManager.ensureStreamSafety");
    }

    const workspaceStreamsValue = Reflect.get(streamManager, "workspaceStreams") as unknown;
    if (!(workspaceStreamsValue instanceof Map)) {
      throw new Error("StreamManager.workspaceStreams is not a Map");
    }
    const workspaceStreams = workspaceStreamsValue as Map<string, WorkspaceStreamInfoStub>;

    const replaceCreateResult = Reflect.set(
      streamManager,
      "createStreamAtomically",
      (
        wsId: string,
        streamToken: string,
        messages: unknown,
        modelArg: unknown,
        modelString: string,
        abortSignal: AbortSignal | undefined,
        system: string,
        historySequence: number,
        tools?: Record<string, unknown>,
        initialMetadata?: Record<string, unknown>,
        _providerOptions?: Record<string, unknown>,
        _maxOutputTokens?: number,
        _toolPolicy?: unknown
      ): WorkspaceStreamInfoStub => {
        operations.push("create");
        const abortController = new AbortController();
        if (abortSignal) {
          abortSignal.addEventListener("abort", () => abortController.abort());
        }

        const streamInfo: WorkspaceStreamInfoStub = {
          state: "starting",
          streamResult: {
            fullStream: (async function* asyncGenerator() {
              // No-op generator; we only care about synchronization
            })(),
            usage: Promise.resolve(undefined),
            providerMetadata: Promise.resolve(undefined),
          },
          abortController,
          messageId: `test-${Math.random().toString(36).slice(2)}`,
          token: streamToken,
          startTime: Date.now(),
          model: modelString,
          initialMetadata,
          historySequence,
          parts: [],
          lastPartialWriteTime: 0,
          partialWriteTimer: undefined,
          partialWritePromise: undefined,
          processingPromise: Promise.resolve(),
        };

        workspaceStreams.set(wsId, streamInfo);
        return streamInfo;
      }
    );

    if (!replaceCreateResult) {
      throw new Error("Failed to mock StreamManager.createStreamAtomically");
    }

    const replaceProcessResult = Reflect.set(
      streamManager,
      "processStreamWithCleanup",
      async (_wsId: string, info: WorkspaceStreamInfoStub): Promise<void> => {
        operations.push("process-start");
        await sleep(20);
        info.state = "streaming";
        operations.push("process-end");
      }
    );

    if (!replaceProcessResult) {
      throw new Error("Failed to mock StreamManager.processStreamWithCleanup");
    }

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
    const ensureOperations = operations.filter((op) => op.startsWith("ensure"));
    for (let i = 0; i < ensureOperations.length - 1; i += 2) {
      expect(ensureOperations[i]).toBe("ensure-start");
      expect(ensureOperations[i + 1]).toBe("ensure-end");
    }
  });
});

describe("StreamManager - Unavailable Tool Handling", () => {
  let streamManager: StreamManager;
  let mockHistoryService: HistoryService;
  let mockPartialService: PartialService;

  beforeEach(() => {
    mockHistoryService = createMockHistoryService();
    mockPartialService = createMockPartialService();
    streamManager = new StreamManager(mockHistoryService, mockPartialService);
  });

  test("should handle tool-error events from SDK", async () => {
    const workspaceId = "test-workspace-tool-error";

    // Track emitted events
    interface ToolEvent {
      type: string;
      toolName?: string;
      result?: unknown;
    }
    const events: ToolEvent[] = [];

    streamManager.on("tool-call-start", (data: { toolName: string }) => {
      events.push({ type: "tool-call-start", toolName: data.toolName });
    });

    streamManager.on("tool-call-end", (data: { toolName: string; result: unknown }) => {
      events.push({ type: "tool-call-end", toolName: data.toolName, result: data.result });
    });

    // Mock a stream that emits tool-error event (AI SDK 5.0 behavior)
    const mockStreamResult = {
      // eslint-disable-next-line @typescript-eslint/require-await
      fullStream: (async function* () {
        // SDK emits tool-call when model requests a tool
        yield {
          type: "tool-call",
          toolCallId: "test-call-1",
          toolName: "file_edit_replace_string",
          input: { file_path: "/test", old_string: "foo", new_string: "bar" },
        };
        // SDK emits tool-error when tool execution fails
        yield {
          type: "tool-error",
          toolCallId: "test-call-1",
          toolName: "file_edit_replace_string",
          error: "Tool not found",
        };
      })(),
      usage: Promise.resolve(undefined),
      providerMetadata: Promise.resolve({}),
    };

    // Create streamInfo for testing
    const streamInfo = {
      state: 2, // STREAMING
      streamResult: mockStreamResult,
      abortController: new AbortController(),
      messageId: "test-message-1",
      token: "test-token",
      startTime: Date.now(),
      model: "test-model",
      historySequence: 1,
      parts: [],
      lastPartialWriteTime: 0,
      processingPromise: Promise.resolve(),
    };

    // Access private method for testing
    // @ts-expect-error - accessing private method for testing
    await streamManager.processStreamWithCleanup(workspaceId, streamInfo, 1);

    // Verify events were emitted correctly
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0]).toMatchObject({
      type: "tool-call-start",
      toolName: "file_edit_replace_string",
    });
    expect(events[1]).toMatchObject({
      type: "tool-call-end",
      toolName: "file_edit_replace_string",
    });

    // Verify error result
    const errorResult = events[1].result as { error?: string };
    expect(errorResult?.error).toBe("Tool not found");
  });
});
