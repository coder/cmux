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
} from "./helpers";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

// Validate API keys before running tests
if (shouldRunIntegrationTests()) {
  validateApiKeys(["OPENAI_API_KEY", "ANTHROPIC_API_KEY"]);
}

// Test both providers with their respective models
const PROVIDER_CONFIGS: Array<[string, string]> = [
  ["openai", "gpt-5"],
  ["anthropic", "claude-sonnet-4-5"],
];

// Integration test timeout guidelines:
// - Individual tests should complete within 10 seconds when possible
// - Use tight timeouts (5-10s) for event waiting to fail fast
// - Longer running tests (tool calls, multiple edits) can take up to 30s
// - Test timeout values (in describe/test) should be 2-3x the expected duration

describeIntegration("IpcMain sendMessage integration tests", () => {
  // Run tests for each provider concurrently
  describe.each(PROVIDER_CONFIGS)("%s:%s provider tests", (provider, model) => {
    test("should successfully send message and receive response", async () => {
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
    }, 15000);

    test("should handle empty message during streaming (interrupt)", async () => {
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

    test("should handle message editing with history truncation", async () => {
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
    }, 20000);

    test("should handle message editing during active stream with tool calls", async () => {
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
});
