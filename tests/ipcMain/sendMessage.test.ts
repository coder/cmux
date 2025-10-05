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
  sendMessage,
  modelString,
  createEventCollector,
  assertStreamSuccess,
  assertError,
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
    const modelId = modelString(provider, model);

    test("should successfully send message and receive response", async () => {
      // Setup test environment
      const { env, workspaceId, cleanup } = await setupWorkspace(provider);
      try {
        // Send a simple message
        const result = await sendMessage(
          env.mockIpcRenderer,
          workspaceId,
          "Say 'hello' and nothing else",
          { model: modelId }
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
    }, 15000);

    test("should handle empty message during streaming (interrupt)", async () => {
      // Setup test environment
      const { env, workspaceId, cleanup } = await setupWorkspace(provider);
      try {
        // Start a long-running stream with a bash command that takes time
        const longMessage = "Run this bash command: sleep 60 && echo done";
        void sendMessage(env.mockIpcRenderer, workspaceId, longMessage, { model: modelId });

        // Wait for stream to start
        const collector = createEventCollector(env.sentEvents, workspaceId);
        await collector.waitForEvent("stream-start", 5000);

        // Send empty message to interrupt
        const interruptResult = await sendMessage(
          env.mockIpcRenderer,
          workspaceId,
          "",
          { model: modelId }
        );

        // Should succeed (interrupt is not an error)
        expect(interruptResult.success).toBe(true);

        // Wait a bit for abort event
        await new Promise((resolve) => setTimeout(resolve, 1000));
        collector.collect();

        // Should have received stream-abort or stream-end
        const hasAbort = collector
          .getEvents()
          .some((e) => "type" in e && e.type === "stream-abort");
        const hasEnd = collector.hasStreamEnd();

        expect(hasAbort || hasEnd).toBe(true);
      } finally {
        await cleanup();
      }
    }, 15000);

    test("should reject empty message when not streaming", async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace(provider);
      try {
        // Send empty message without any active stream
        const result = await sendMessage(
          env.mockIpcRenderer,
          workspaceId,
          "",
          { model: modelId }
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

    test("should handle message editing with history truncation", async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace(provider);
      try {
        // Send first message
        const result1 = await sendMessage(
          env.mockIpcRenderer,
          workspaceId,
          "Say 'first message' and nothing else",
          { model: modelId }
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
        const result2 = await sendMessage(
          env.mockIpcRenderer,
          workspaceId,
          "Say 'edited message' and nothing else",
          {
            editMessageId: (firstUserMessage as { id: string }).id,
            model: modelId,
          }
        );
        expect(result2.success).toBe(true);

        // Wait for edited stream to complete
        const collector2 = createEventCollector(env.sentEvents, workspaceId);
        await collector2.waitForEvent("stream-end", 10000);
        assertStreamSuccess(collector2);
      } finally {
        await cleanup();
      }
    }, 20000);

    test("should handle message editing during active stream with tool calls", async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace(provider);
      try {
        // Send a message that will trigger a long-running tool call
        const result1 = await sendMessage(
          env.mockIpcRenderer,
          workspaceId,
          "Run this bash command: sleep 10 && echo done",
          { model: modelId }
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
        const result2 = await sendMessage(
          env.mockIpcRenderer,
          workspaceId,
          "Run this bash command: sleep 5 && echo second",
          {
            editMessageId: (firstUserMessage as { id: string }).id,
            model: modelId,
          }
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
        const result3 = await sendMessage(
          env.mockIpcRenderer,
          workspaceId,
          "Say 'third edit' and nothing else",
          {
            editMessageId: (secondUserMessage as { id: string }).id,
            model: modelId,
          }
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
    }, 30000);

    test("should handle tool calls and return file contents", async () => {
      const { env, workspaceId, workspacePath, cleanup } = await setupWorkspace(provider);
      try {
        // Generate a random string
        const randomString = `test-content-${Date.now()}-${Math.random().toString(36).substring(7)}`;

        // Write the random string to a file in the workspace
        const testFilePath = path.join(workspacePath, "test-file.txt");
        await fs.writeFile(testFilePath, randomString, "utf-8");

        // Ask the model to read the file
        const result = await sendMessage(
          env.mockIpcRenderer,
          workspaceId,
          "Read the file test-file.txt and tell me its contents verbatim. Do not add any extra text.",
          { model: modelId }
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
    }, 20000);

    test("should maintain conversation continuity across messages", async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace(provider);
      try {
        // First message: Ask for a random word
        const result1 = await sendMessage(
          env.mockIpcRenderer,
          workspaceId,
          "Generate a random uncommon word and only say that word, nothing else.",
          { model: modelId }
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
        const result2 = await sendMessage(
          env.mockIpcRenderer,
          workspaceId,
          "What was the word you just said? Reply with only that word.",
          { model: modelId }
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
        if (secondStreamEnd && "parts" in secondStreamEnd && Array.isArray(secondStreamEnd.parts)) {
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
    }, 20000);

    test("should return error when model is not provided", async () => {
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

    test("should return error for invalid model string", async () => {
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
    test("both providers should handle the same message", async () => {
      const results: Record<string, { success: boolean; responseLength: number }> = {};

      for (const [provider, model] of PROVIDER_CONFIGS) {
        // Create fresh environment with provider setup
        const { env, workspaceId, cleanup } = await setupWorkspace(provider);
        const modelId = modelString(provider, model);


        // Send same message to both providers
        const result = await sendMessage(
          env.mockIpcRenderer,
          workspaceId,
          "Say 'parity test' and nothing else",
          { model: modelId }
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
    }, 30000);
  });

  // Error handling tests for API key issues
  describe("API key error handling", () => {
    test.each(PROVIDER_CONFIGS)(
      "%s should return api_key_not_found error when API key is missing",
      async (provider, model) => {
        const { env, workspaceId, cleanup } = await setupWorkspaceWithoutProvider(
          `noapi-${provider}`
        );
        const modelId = modelString(provider, model);
        try {
          // Try to send message without API key configured
          const result = await sendMessage(
            env.mockIpcRenderer,
            workspaceId,
            "Hello",
            { model: modelId }
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
          const result = await sendMessage(
            env.mockIpcRenderer,
            workspaceId,
            "Hello, world!",
            { model: modelString(provider, nonExistentModel) }
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
          const modelId = modelString(provider, model);

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
          const result = await sendMessage(
            env.mockIpcRenderer,
            workspaceId,
            "What is the weather?",
            { model: modelId }
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
});
