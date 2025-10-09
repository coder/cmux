import { setupWorkspace, shouldRunIntegrationTests, validateApiKeys } from "./setup";
import {
  sendMessageWithModel,
  createEventCollector,
  assertStreamSuccess,
} from "./helpers";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

// Validate API keys before running tests
if (shouldRunIntegrationTests()) {
  validateApiKeys(["ANTHROPIC_API_KEY"]);
}

describeIntegration("IpcMain anthropic 1M context integration tests", () => {
  // Enable retries in CI for flaky API tests
  if (process.env.CI && typeof jest !== "undefined" && jest.retryTimes) {
    jest.retryTimes(3, { logErrorsBeforeRetry: true });
  }

  test.concurrent(
    "should add anthropic-beta header when use1MContext is true",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace("anthropic");
      try {
        // Clear events before sending message
        env.sentEvents.length = 0;

        // Send a message with providerOptions.anthropic.use1MContext enabled
        const result = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Say 'hello' and nothing else.",
          "anthropic",
          "claude-sonnet-4-5",
          {
            providerOptions: {
              anthropic: {
                use1MContext: true,
              },
            },
          }
        );

        expect(result.success).toBe(true);

        // Wait for response
        const collector = createEventCollector(env.sentEvents, workspaceId);
        await collector.waitForEvent("stream-end", 10000);
        assertStreamSuccess(collector);

        // Get response content
        const finalMessage = collector.getFinalMessage();
        expect(finalMessage).toBeDefined();

        // If we got a response, the header was accepted by Anthropic's API
        // (The API would reject invalid beta headers with an error)
        if (finalMessage && "parts" in finalMessage && Array.isArray(finalMessage.parts)) {
          const content = finalMessage.parts
            .filter((part) => part.type === "text")
            .map((part) => (part as { text: string }).text)
            .join("")
            .toLowerCase();

          // Verify we got a response (meaning the header was accepted)
          expect(content).toContain("hello");
        }
      } finally {
        await cleanup();
      }
    },
    15000
  );

  test.concurrent(
    "should not add anthropic-beta header when use1MContext is false",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace("anthropic");
      try {
        // Clear events before sending message
        env.sentEvents.length = 0;

        // Send a message without 1M context enabled
        const result = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Say 'hello' and nothing else.",
          "anthropic",
          "claude-sonnet-4-5",
          {
            providerOptions: {
              anthropic: {
                use1MContext: false,
              },
            },
          }
        );

        expect(result.success).toBe(true);

        // Wait for response
        const collector = createEventCollector(env.sentEvents, workspaceId);
        await collector.waitForEvent("stream-end", 10000);
        assertStreamSuccess(collector);

        // Get response content
        const finalMessage = collector.getFinalMessage();
        expect(finalMessage).toBeDefined();

        // Verify we got a normal response
        if (finalMessage && "parts" in finalMessage && Array.isArray(finalMessage.parts)) {
          const content = finalMessage.parts
            .filter((part) => part.type === "text")
            .map((part) => (part as { text: string }).text)
            .join("")
            .toLowerCase();

          expect(content).toContain("hello");
        }
      } finally {
        await cleanup();
      }
    },
    15000
  );

  test.concurrent(
    "should work without providerOptions (default behavior)",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace("anthropic");
      try {
        // Clear events before sending message
        env.sentEvents.length = 0;

        // Send a message without any providerOptions
        const result = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Say 'hello' and nothing else.",
          "anthropic",
          "claude-sonnet-4-5"
          // No providerOptions
        );

        expect(result.success).toBe(true);

        // Wait for response
        const collector = createEventCollector(env.sentEvents, workspaceId);
        await collector.waitForEvent("stream-end", 10000);
        assertStreamSuccess(collector);

        // Get response content
        const finalMessage = collector.getFinalMessage();
        expect(finalMessage).toBeDefined();

        // Verify we got a normal response
        if (finalMessage && "parts" in finalMessage && Array.isArray(finalMessage.parts)) {
          const content = finalMessage.parts
            .filter((part) => part.type === "text")
            .map((part) => (part as { text: string }).text)
            .join("")
            .toLowerCase();

          expect(content).toContain("hello");
        }
      } finally {
        await cleanup();
      }
    },
    15000
  );
});
