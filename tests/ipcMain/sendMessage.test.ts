import * as fs from "fs/promises";
import * as path from "path";
import {
  setupWorkspace,
  setupWorkspaceWithoutProvider,
  shouldRunIntegrationTests,
  validateApiKeys,
  type TestEnvironment,
} from "./setup";
import {
  sendMessageWithModel,
  sendMessage,
  createEventCollector,
  assertStreamSuccess,
  assertError,
  waitFor,
} from "./helpers";
import { HistoryService } from "../../src/services/historyService";
import { createCmuxMessage } from "../../src/types/message";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

// Validate API keys before running tests
if (shouldRunIntegrationTests()) {
  validateApiKeys(["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]);
}

// Test both providers with their respective models
const PROVIDER_CONFIGS: Array<[string, string]> = [
  ["openai", "gpt-5-codex"],
  ["anthropic", "claude-sonnet-4-5"],
];

// Integration test timeout guidelines:
// - Individual tests should complete within 10 seconds when possible
// - Use tight timeouts (5-10s) for event waiting to fail fast
// - Longer running tests (tool calls, multiple edits) can take up to 30s
// - Test timeout values (in describe/test) should be 2-3x the expected duration

describeIntegration("IpcMain sendMessage integration tests", () => {
  // Enable retries in CI for flaky API tests (only works with Jest, not Bun test runner)
  if (process.env.CI && typeof jest !== "undefined" && jest.retryTimes) {
    jest.retryTimes(3, { logErrorsBeforeRetry: true });
  }
  // Run tests for each provider concurrently
  describe.each(PROVIDER_CONFIGS)("%s:%s provider tests", (provider, model) => {
    test.concurrent(
      "should successfully send message and receive response",
      async () => {
        // Setup test environment
        const { env, workspaceId, cleanup } = await setupWorkspace(provider);
        try {
          // Send a simple message
          const result = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            "Say 'hello' and nothing else",
            provider,
            model
          );

          // Verify the IPC call succeeded
          expect(result.success).toBe(true);

          // Collect and verify stream events
          const collector = createEventCollector(env.sentEvents, workspaceId);
          const streamEnd = await collector.waitForEvent("stream-end");

          expect(streamEnd).toBeDefined();
          assertStreamSuccess(collector);

          // Verify we received deltas
          const deltas = collector.getDeltas();
          expect(deltas.length).toBeGreaterThan(0);
        } finally {
          await cleanup();
        }
      },
      15000
    );

    test.concurrent(
      "should handle empty message during streaming (interrupt)",
      async () => {
        // Setup test environment
        const { env, workspaceId, cleanup } = await setupWorkspace(provider);
        try {
          // Start a long-running stream with a bash command that takes time
          const longMessage = "Run this bash command: sleep 60 && echo done";
          void sendMessageWithModel(env.mockIpcRenderer, workspaceId, longMessage, provider, model);

          // Wait for stream to start
          const collector = createEventCollector(env.sentEvents, workspaceId);
          await collector.waitForEvent("stream-start", 5000);

          // Send empty message to interrupt
          const interruptResult = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            "",
            provider,
            model
          );

          // Should succeed (interrupt is not an error)
          expect(interruptResult.success).toBe(true);

          // Wait for abort or end event
          const abortOrEndReceived = await waitFor(() => {
            collector.collect();
            const hasAbort = collector
              .getEvents()
              .some((e) => "type" in e && e.type === "stream-abort");
            const hasEnd = collector.hasStreamEnd();
            return hasAbort || hasEnd;
          }, 5000);

          expect(abortOrEndReceived).toBe(true);
        } finally {
          await cleanup();
        }
      },
      15000
    );

    test.concurrent(
      "should handle reconnection during active stream",
      async () => {
        // Only test with Anthropic (faster and more reliable for this test)
        if (provider === "openai") {
          return;
        }

        const { env, workspaceId, cleanup } = await setupWorkspace(provider);
        try {
          // Start a stream with tool call that takes 10 seconds
          void sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            "Run this bash command: sleep 10",
            provider,
            model
          );

          // Wait for tool-call-start (which means model is executing bash)
          const collector1 = createEventCollector(env.sentEvents, workspaceId);
          const streamStartEvent = await collector1.waitForEvent("stream-start", 5000);
          expect(streamStartEvent).toBeDefined();

          await collector1.waitForEvent("tool-call-start", 10000);

          // At this point, bash sleep is running (will take 10 seconds if abort doesn't work)
          // Get message ID for verification
          collector1.collect();
          const messageId =
            streamStartEvent && "messageId" in streamStartEvent
              ? streamStartEvent.messageId
              : undefined;
          expect(messageId).toBeDefined();

          // Simulate reconnection by clearing events and re-subscribing
          env.sentEvents.length = 0;

          // Use ipcRenderer.send() to trigger ipcMain.on() handler (correct way for electron-mock-ipc)
          env.mockIpcRenderer.send("workspace:chat:subscribe", workspaceId);

          // Wait for async subscription handler to complete by polling for caught-up
          const collector2 = createEventCollector(env.sentEvents, workspaceId);
          const caughtUpMessage = await collector2.waitForEvent("caught-up", 5000);
          expect(caughtUpMessage).toBeDefined();

          // Collect all reconnection events
          collector2.collect();
          const reconnectionEvents = collector2.getEvents();

          // Verify we received stream-start event (not a partial message with INTERRUPTED)
          const reconnectStreamStart = reconnectionEvents.find(
            (e) => "type" in e && e.type === "stream-start"
          );

          // If stream completed before reconnection, we'll get a regular message instead
          // This is expected behavior - only active streams get replayed
          const hasStreamStart = !!reconnectStreamStart;
          const hasRegularMessage = reconnectionEvents.some(
            (e) => "role" in e && e.role === "assistant"
          );

          // Either we got stream replay (active stream) OR regular message (completed stream)
          expect(hasStreamStart || hasRegularMessage).toBe(true);

          // If we did get stream replay, verify it
          if (hasStreamStart) {
            expect(reconnectStreamStart).toBeDefined();
            expect(
              reconnectStreamStart && "messageId" in reconnectStreamStart
                ? reconnectStreamStart.messageId
                : undefined
            ).toBe(messageId);

            // Verify we received tool-call-start (replay of accumulated tool event)
            const reconnectToolStart = reconnectionEvents.filter(
              (e) => "type" in e && e.type === "tool-call-start"
            );
            expect(reconnectToolStart.length).toBeGreaterThan(0);

            // Verify we did NOT receive a partial message (which would show INTERRUPTED)
            const partialMessages = reconnectionEvents.filter(
              (e) =>
                "role" in e &&
                e.role === "assistant" &&
                "metadata" in e &&
                (e as { metadata?: { partial?: boolean } }).metadata?.partial === true
            );
            expect(partialMessages.length).toBe(0);
          }

          // Note: If test completes quickly (~5s), abort signal worked and killed sleep
          // If test takes ~10s, abort signal didn't work and sleep ran to completion
        } finally {
          await cleanup();
        }
      },
      15000
    );

    test.concurrent("should reject empty message when not streaming", async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace(provider);
      try {
        // Send empty message without any active stream
        const result = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "",
          provider,
          model
        );

        // Should succeed (no error shown to user)
        expect(result.success).toBe(true);

        // Should not have created any stream events
        const collector = createEventCollector(env.sentEvents, workspaceId);
        collector.collect();

        const streamEvents = collector
          .getEvents()
          .filter((e) => "type" in e && e.type?.startsWith("stream-"));
        expect(streamEvents.length).toBe(0);
      } finally {
        await cleanup();
      }
    });

    test.concurrent(
      "should handle message editing with history truncation",
      async () => {
        const { env, workspaceId, cleanup } = await setupWorkspace(provider);
        try {
          // Send first message
          const result1 = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            "Say 'first message' and nothing else",
            provider,
            model
          );
          expect(result1.success).toBe(true);

          // Wait for first stream to complete
          const collector1 = createEventCollector(env.sentEvents, workspaceId);
          await collector1.waitForEvent("stream-end", 10000);
          const firstUserMessage = collector1
            .getEvents()
            .find((e) => "role" in e && e.role === "user");
          expect(firstUserMessage).toBeDefined();

          // Clear events
          env.sentEvents.length = 0;

          // Edit the first message (send new message with editMessageId)
          const result2 = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            "Say 'edited message' and nothing else",
            provider,
            model,
            { editMessageId: (firstUserMessage as { id: string }).id }
          );
          expect(result2.success).toBe(true);

          // Wait for edited stream to complete
          const collector2 = createEventCollector(env.sentEvents, workspaceId);
          await collector2.waitForEvent("stream-end", 10000);
          assertStreamSuccess(collector2);
        } finally {
          await cleanup();
        }
      },
      20000
    );

    test.concurrent(
      "should handle message editing during active stream with tool calls",
      async () => {
        const { env, workspaceId, cleanup } = await setupWorkspace(provider);
        try {
          // Send a message that will trigger a long-running tool call
          const result1 = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            "Run this bash command: sleep 10 && echo done",
            provider,
            model
          );
          expect(result1.success).toBe(true);

          // Wait for tool call to start (ensuring it's committed to history)
          const collector1 = createEventCollector(env.sentEvents, workspaceId);
          await collector1.waitForEvent("tool-call-start", 10000);
          const firstUserMessage = collector1
            .getEvents()
            .find((e) => "role" in e && e.role === "user");
          expect(firstUserMessage).toBeDefined();

          // First edit: Edit the message while stream is still active
          env.sentEvents.length = 0;
          const result2 = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            "Run this bash command: sleep 5 && echo second",
            provider,
            model,
            { editMessageId: (firstUserMessage as { id: string }).id }
          );
          expect(result2.success).toBe(true);

          // Wait for first edit to start tool call
          const collector2 = createEventCollector(env.sentEvents, workspaceId);
          await collector2.waitForEvent("tool-call-start", 10000);
          const secondUserMessage = collector2
            .getEvents()
            .find((e) => "role" in e && e.role === "user");
          expect(secondUserMessage).toBeDefined();

          // Second edit: Edit again while second stream is still active
          // This should trigger the bug with orphaned tool calls
          env.sentEvents.length = 0;
          const result3 = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            "Say 'third edit' and nothing else",
            provider,
            model,
            { editMessageId: (secondUserMessage as { id: string }).id }
          );
          expect(result3.success).toBe(true);

          // Wait for either stream-end or stream-error (error expected for OpenAI)
          const collector3 = createEventCollector(env.sentEvents, workspaceId);
          await Promise.race([
            collector3.waitForEvent("stream-end", 10000),
            collector3.waitForEvent("stream-error", 10000),
          ]);

          assertStreamSuccess(collector3);

          // Verify the response contains the final edited message content
          const finalMessage = collector3.getFinalMessage();
          expect(finalMessage).toBeDefined();
          if (finalMessage && "content" in finalMessage) {
            expect(finalMessage.content).toContain("third edit");
          }
        } finally {
          await cleanup();
        }
      },
      30000
    );

    test.concurrent(
      "should handle tool calls and return file contents",
      async () => {
        const { env, workspaceId, workspacePath, cleanup } = await setupWorkspace(provider);
        try {
          // Generate a random string
          const randomString = `test-content-${Date.now()}-${Math.random().toString(36).substring(7)}`;

          // Write the random string to a file in the workspace
          const testFilePath = path.join(workspacePath, "test-file.txt");
          await fs.writeFile(testFilePath, randomString, "utf-8");

          // Ask the model to read the file
          const result = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            "Read the file test-file.txt and tell me its contents verbatim. Do not add any extra text.",
            provider,
            model
          );

          expect(result.success).toBe(true);

          // Wait for stream to complete
          const collector = createEventCollector(env.sentEvents, workspaceId);
          await collector.waitForEvent("stream-end", 10000);
          assertStreamSuccess(collector);

          // Get the final assistant message
          const finalMessage = collector.getFinalMessage();
          expect(finalMessage).toBeDefined();

          // Check that the response contains the random string
          if (finalMessage && "content" in finalMessage) {
            expect(finalMessage.content).toContain(randomString);
          }
        } finally {
          await cleanup();
        }
      },
      20000
    );

    test.concurrent(
      "should maintain conversation continuity across messages",
      async () => {
        const { env, workspaceId, cleanup } = await setupWorkspace(provider);
        try {
          // First message: Ask for a random word
          const result1 = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            "Generate a random uncommon word and only say that word, nothing else.",
            provider,
            model
          );
          expect(result1.success).toBe(true);

          // Wait for first stream to complete
          const collector1 = createEventCollector(env.sentEvents, workspaceId);
          await collector1.waitForEvent("stream-end", 10000);
          assertStreamSuccess(collector1);

          // Extract the random word from the response
          const firstStreamEnd = collector1.getFinalMessage();
          expect(firstStreamEnd).toBeDefined();
          expect(firstStreamEnd && "parts" in firstStreamEnd).toBe(true);

          // Extract text from parts
          let firstContent = "";
          if (firstStreamEnd && "parts" in firstStreamEnd && Array.isArray(firstStreamEnd.parts)) {
            firstContent = firstStreamEnd.parts
              .filter((part) => part.type === "text")
              .map((part) => (part as { text: string }).text)
              .join("");
          }

          const randomWord = firstContent.trim().split(/\s+/)[0]; // Get first word
          expect(randomWord.length).toBeGreaterThan(0);

          // Clear events for second message
          env.sentEvents.length = 0;

          // Second message: Ask for the same word (testing conversation memory)
          const result2 = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            "What was the word you just said? Reply with only that word.",
            provider,
            model
          );
          expect(result2.success).toBe(true);

          // Wait for second stream to complete
          const collector2 = createEventCollector(env.sentEvents, workspaceId);
          await collector2.waitForEvent("stream-end", 10000);
          assertStreamSuccess(collector2);

          // Verify the second response contains the same word
          const secondStreamEnd = collector2.getFinalMessage();
          expect(secondStreamEnd).toBeDefined();
          expect(secondStreamEnd && "parts" in secondStreamEnd).toBe(true);

          // Extract text from parts
          let secondContent = "";
          if (
            secondStreamEnd &&
            "parts" in secondStreamEnd &&
            Array.isArray(secondStreamEnd.parts)
          ) {
            secondContent = secondStreamEnd.parts
              .filter((part) => part.type === "text")
              .map((part) => (part as { text: string }).text)
              .join("");
          }

          const responseWords = secondContent.toLowerCase().trim();
          const originalWord = randomWord.toLowerCase();

          // Check if the response contains the original word
          expect(responseWords).toContain(originalWord);
        } finally {
          await cleanup();
        }
      },
      20000
    );

    test.concurrent("should return error when model is not provided", async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace(provider);
      try {
        // Send message without model
        const result = await sendMessage(
          env.mockIpcRenderer,
          workspaceId,
          "Hello",
          {} as { model: string }
        );

        // Should fail with appropriate error
        assertError(result, "unknown");
        if (!result.success && result.error.type === "unknown") {
          expect(result.error.raw).toContain("No model specified");
        }
      } finally {
        await cleanup();
      }
    });

    test.concurrent("should return error for invalid model string", async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace(provider);
      try {
        // Send message with invalid model format
        const result = await sendMessage(env.mockIpcRenderer, workspaceId, "Hello", {
          model: "invalid-format",
        });

        // Should fail with invalid_model_string error
        assertError(result, "invalid_model_string");
      } finally {
        await cleanup();
      }
    });
  });

  // Provider parity tests - ensure both providers handle the same scenarios
  describe("provider parity", () => {
    test.concurrent(
      "both providers should handle the same message",
      async () => {
        const results: Record<string, { success: boolean; responseLength: number }> = {};

        for (const [provider, model] of PROVIDER_CONFIGS) {
          // Create fresh environment with provider setup
          const { env, workspaceId, cleanup } = await setupWorkspace(provider);

          // Send same message to both providers
          const result = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            "Say 'parity test' and nothing else",
            provider,
            model
          );

          // Collect response
          const collector = createEventCollector(env.sentEvents, workspaceId);
          await collector.waitForEvent("stream-end", 10000);

          results[provider] = {
            success: result.success,
            responseLength: collector.getDeltas().length,
          };

          // Cleanup
          await cleanup();
        }

        // Verify both providers succeeded
        expect(results.openai.success).toBe(true);
        expect(results.anthropic.success).toBe(true);

        // Verify both providers generated responses (non-zero deltas)
        expect(results.openai.responseLength).toBeGreaterThan(0);
        expect(results.anthropic.responseLength).toBeGreaterThan(0);
      },
      30000
    );
  });

  // Error handling tests for API key issues
  describe("API key error handling", () => {
    test.each(PROVIDER_CONFIGS)(
      "%s should return api_key_not_found error when API key is missing",
      async (provider, model) => {
        const { env, workspaceId, cleanup } = await setupWorkspaceWithoutProvider(
          `noapi-${provider}`
        );
        try {
          // Try to send message without API key configured
          const result = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            "Hello",
            provider,
            model
          );

          // Should fail with api_key_not_found error
          assertError(result, "api_key_not_found");
          if (!result.success && result.error.type === "api_key_not_found") {
            expect(result.error.provider).toBe(provider);
          }
        } finally {
          await cleanup();
        }
      }
    );
  });

  // Non-existent model error handling tests
  describe("non-existent model error handling", () => {
    test.each(PROVIDER_CONFIGS)(
      "%s should return stream error when model does not exist",
      async (provider) => {
        const { env, workspaceId, cleanup } = await setupWorkspace(provider);
        try {
          // Use a clearly non-existent model name
          const nonExistentModel = "definitely-not-a-real-model-12345";
          const result = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            "Hello, world!",
            provider,
            nonExistentModel
          );

          // IPC call should succeed (errors come through stream events)
          expect(result.success).toBe(true);

          // Wait for stream-error event
          const collector = createEventCollector(env.sentEvents, workspaceId);
          const errorEvent = await collector.waitForEvent("stream-error", 10000);

          // Should have received a stream-error event
          expect(errorEvent).toBeDefined();
          expect(collector.hasError()).toBe(true);

          // Verify error message is the enhanced user-friendly version
          if (errorEvent && "error" in errorEvent) {
            const errorMsg = String(errorEvent.error);
            // Should have the enhanced error message format
            expect(errorMsg).toContain("definitely-not-a-real-model-12345");
            expect(errorMsg).toContain("does not exist or is not available");
          }

          // Verify error type is properly categorized
          if (errorEvent && "errorType" in errorEvent) {
            expect(errorEvent.errorType).toBe("model_not_found");
          }
        } finally {
          await cleanup();
        }
      }
    );
  });

  // Token limit error handling tests
  describe("token limit error handling", () => {
    test.each(PROVIDER_CONFIGS)(
      "%s should return error when accumulated history exceeds token limit",
      async (provider, model) => {
        const { env, workspaceId, cleanup } = await setupWorkspace(provider);
        try {
          // HACK: Build up a large conversation history using HistoryService directly
          // This is a test-only shortcut to quickly populate history without streaming.
          // Real application code should NEVER bypass IPC like this.
          const historyService = new HistoryService(env.config);

          // Create ~50k chars per message
          const messageSize = 50_000;
          const largeText = "a".repeat(messageSize);

          // Different providers have different limits:
          // - Anthropic: 200k tokens → need ~40 messages of 50k chars (2M chars total)
          // - OpenAI: varies by model, use ~80 messages (4M chars total) to ensure we hit the limit
          const messageCount = provider === "anthropic" ? 40 : 80;

          // Build conversation history with alternating user/assistant messages
          for (let i = 0; i < messageCount; i++) {
            const isUser = i % 2 === 0;
            const role = isUser ? "user" : "assistant";
            const message = createCmuxMessage(`history-msg-${i}`, role, largeText, {});

            const result = await historyService.appendToHistory(workspaceId, message);
            expect(result.success).toBe(true);
          }

          // Now try to send a new message - should trigger token limit error
          // due to accumulated history
          const result = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            "What is the weather?",
            provider,
            model
          );

          // IPC call itself should succeed (errors come through stream events)
          expect(result.success).toBe(true);

          // Wait for either stream-end or stream-error
          const collector = createEventCollector(env.sentEvents, workspaceId);
          await Promise.race([
            collector.waitForEvent("stream-end", 10000),
            collector.waitForEvent("stream-error", 10000),
          ]);

          // Should have received error event with token limit error
          expect(collector.hasError()).toBe(true);

          // Verify error is properly categorized as context_exceeded
          const errorEvents = collector
            .getEvents()
            .filter((e) => "type" in e && e.type === "stream-error");
          expect(errorEvents.length).toBeGreaterThan(0);

          const errorEvent = errorEvents[0];

          // Verify error type is context_exceeded
          if (errorEvent && "errorType" in errorEvent) {
            expect(errorEvent.errorType).toBe("context_exceeded");
          }

          // NEW: Verify error handling improvements
          // 1. Verify error event includes messageId
          if (errorEvent && "messageId" in errorEvent) {
            expect(errorEvent.messageId).toBeDefined();
            expect(typeof errorEvent.messageId).toBe("string");
          }

          // 2. Verify error persists across "reload" by simulating page reload via IPC
          // Clear sentEvents and trigger subscription (simulates what happens on page reload)
          env.sentEvents.length = 0;

          // Trigger the subscription using ipcRenderer.send() (correct way to trigger ipcMain.on())
          env.mockIpcRenderer.send(`workspace:chat:subscribe`, workspaceId);

          // Wait for the async subscription handler to complete by polling for caught-up
          const reloadCollector = createEventCollector(env.sentEvents, workspaceId);
          const caughtUpMessage = await reloadCollector.waitForEvent("caught-up", 10000);
          expect(caughtUpMessage).toBeDefined();

          // 3. Find the partial message with error metadata in reloaded messages
          const reloadedMessages = reloadCollector.getEvents();
          const partialMessage = reloadedMessages.find(
            (msg) =>
              msg &&
              typeof msg === "object" &&
              "metadata" in msg &&
              msg.metadata &&
              typeof msg.metadata === "object" &&
              "error" in msg.metadata
          );

          // 4. Verify partial message has error metadata
          expect(partialMessage).toBeDefined();
          if (
            partialMessage &&
            typeof partialMessage === "object" &&
            "metadata" in partialMessage &&
            partialMessage.metadata &&
            typeof partialMessage.metadata === "object"
          ) {
            expect("error" in partialMessage.metadata).toBe(true);
            expect("errorType" in partialMessage.metadata).toBe(true);
            expect("partial" in partialMessage.metadata).toBe(true);
            if ("partial" in partialMessage.metadata) {
              expect(partialMessage.metadata.partial).toBe(true);
            }

            // Verify error type is context_exceeded
            if ("errorType" in partialMessage.metadata) {
              expect(partialMessage.metadata.errorType).toBe("context_exceeded");
            }
          }
        } finally {
          await cleanup();
        }
      },
      30000
    );
  });

  // Tool policy tests
  describe("tool policy", () => {
    // Retry tool policy tests in CI (they depend on external API behavior)
    if (process.env.CI && typeof jest !== "undefined" && jest.retryTimes) {
      jest.retryTimes(2, { logErrorsBeforeRetry: true });
    }

    test.each(PROVIDER_CONFIGS)(
      "%s should respect tool policy that disables bash",
      async (provider, model) => {
        const { env, workspaceId, workspacePath, cleanup } = await setupWorkspace(provider);
        try {
          // Create a test file in the workspace
          const testFilePath = path.join(workspacePath, "bash-test-file.txt");
          await fs.writeFile(testFilePath, "original content", "utf-8");

          // Verify file exists
          expect(
            await fs.access(testFilePath).then(
              () => true,
              () => false
            )
          ).toBe(true);

          // Ask AI to delete the file using bash (which should be disabled)
          const result = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            "Delete the file bash-test-file.txt using bash rm command",
            provider,
            model,
            {
              toolPolicy: [{ regex_match: "bash", action: "disable" }],
            }
          );

          // IPC call should succeed
          expect(result.success).toBe(true);

          // Wait for stream to complete (longer timeout for tool policy tests)
          const collector = createEventCollector(env.sentEvents, workspaceId);
          
          // Wait for either stream-end or stream-error
          // (helpers will log diagnostic info on failure)
          await Promise.race([
            collector.waitForEvent("stream-end", 30000),
            collector.waitForEvent("stream-error", 30000),
          ]);

          // This will throw with detailed error info if stream didn't complete successfully
          assertStreamSuccess(collector);

          // Verify file still exists (bash tool was disabled, so deletion shouldn't have happened)
          const fileStillExists = await fs.access(testFilePath).then(
            () => true,
            () => false
          );
          expect(fileStillExists).toBe(true);

          // Verify content unchanged
          const content = await fs.readFile(testFilePath, "utf-8");
          expect(content).toBe("original content");
        } finally {
          await cleanup();
        }
      },
      45000
    );

    test.each(PROVIDER_CONFIGS)(
      "%s should respect tool policy that disables file_edit tools",
      async (provider, model) => {
        const { env, workspaceId, workspacePath, cleanup } = await setupWorkspace(provider);
        try {
          // Create a test file with known content
          const testFilePath = path.join(workspacePath, "edit-test-file.txt");
          const originalContent = "original content line 1\noriginal content line 2";
          await fs.writeFile(testFilePath, originalContent, "utf-8");

          // Ask AI to edit the file (which should be disabled)
          // Disable both file_edit tools AND bash to prevent workarounds
          const result = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            "Edit the file edit-test-file.txt and replace 'original' with 'modified'",
            provider,
            model,
            {
              toolPolicy: [
                { regex_match: "file_edit_.*", action: "disable" },
                { regex_match: "bash", action: "disable" },
              ],
            }
          );

          // IPC call should succeed
          expect(result.success).toBe(true);

          // Wait for stream to complete (longer timeout for tool policy tests)
          const collector = createEventCollector(env.sentEvents, workspaceId);
          
          // Wait for either stream-end or stream-error
          // (helpers will log diagnostic info on failure)
          await Promise.race([
            collector.waitForEvent("stream-end", 30000),
            collector.waitForEvent("stream-error", 30000),
          ]);

          // This will throw with detailed error info if stream didn't complete successfully
          assertStreamSuccess(collector);

          // Verify file content unchanged (file_edit tools and bash were disabled)
          const content = await fs.readFile(testFilePath, "utf-8");
          expect(content).toBe(originalContent);
        } finally {
          await cleanup();
        }
      },
      45000
    );
  });

  // Additional system instructions tests
  describe("additional system instructions", () => {
    test.each(PROVIDER_CONFIGS)(
      "%s should pass additionalSystemInstructions through to system message",
      async (provider, model) => {
        const { env, workspaceId, cleanup } = await setupWorkspace(provider);
        try {
          // Send message with custom system instructions that add a distinctive marker
          const result = await sendMessage(env.mockIpcRenderer, workspaceId, "Say hello", {
            model: `${provider}:${model}`,
            additionalSystemInstructions:
              "IMPORTANT: You must include the word BANANA somewhere in every response.",
          });

          // IPC call should succeed
          expect(result.success).toBe(true);

          // Wait for stream to complete
          const collector = createEventCollector(env.sentEvents, workspaceId);
          await collector.waitForEvent("stream-end", 10000);
          assertStreamSuccess(collector);

          // Get the final assistant message
          const finalMessage = collector.getFinalMessage();
          expect(finalMessage).toBeDefined();

          // Verify response contains the distinctive marker from additional system instructions
          if (finalMessage && "parts" in finalMessage && Array.isArray(finalMessage.parts)) {
            const content = finalMessage.parts
              .filter((part) => part.type === "text")
              .map((part) => (part as { text: string }).text)
              .join("");

            expect(content).toContain("BANANA");
          }
        } finally {
          await cleanup();
        }
      },
      15000
    );
  });
});
