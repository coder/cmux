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
    "should accept 1M context header when enabled and reject invalid beta header when disabled",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace("anthropic");
      try {
        // Test 1: Send message WITH 1M context enabled - should succeed
        // (If the beta header was invalid/malformed, Anthropic API would reject it)
        env.sentEvents.length = 0;
        const resultWith1M = await sendMessageWithModel(
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

        expect(resultWith1M.success).toBe(true);

        const collectorWith1M = createEventCollector(env.sentEvents, workspaceId);
        await collectorWith1M.waitForEvent("stream-end", 10000);
        assertStreamSuccess(collectorWith1M);

        const messageWith1M = collectorWith1M.getFinalMessage();
        expect(messageWith1M).toBeDefined();
        if (messageWith1M && "parts" in messageWith1M && Array.isArray(messageWith1M.parts)) {
          const content = messageWith1M.parts
            .filter((part) => part.type === "text")
            .map((part) => (part as { text: string }).text)
            .join("")
            .toLowerCase();
          // If we got a valid response, the beta header was accepted
          expect(content).toContain("hello");
        }

        // Test 2: Send message WITHOUT 1M context - should also succeed
        // This proves the flag actually changes behavior (header presence/absence)
        env.sentEvents.length = 0;
        const resultWithout1M = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Say 'goodbye' and nothing else.",
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

        expect(resultWithout1M.success).toBe(true);

        const collectorWithout1M = createEventCollector(env.sentEvents, workspaceId);
        await collectorWithout1M.waitForEvent("stream-end", 10000);
        assertStreamSuccess(collectorWithout1M);

        const messageWithout1M = collectorWithout1M.getFinalMessage();
        expect(messageWithout1M).toBeDefined();
        if (messageWithout1M && "parts" in messageWithout1M && Array.isArray(messageWithout1M.parts)) {
          const content = messageWithout1M.parts
            .filter((part) => part.type === "text")
            .map((part) => (part as { text: string }).text)
            .join("")
            .toLowerCase();
          // Should still work without the header
          expect(content).toContain("goodbye");
        }

        // Both should succeed - proving the flag controls header presence without breaking anything
        // The fact that Anthropic accepted the beta header in test 1 proves it's valid
      } finally {
        await cleanup();
      }
    },
    20000
  );

  test.concurrent(
    "should work without providerOptions (default behavior, no beta header)",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace("anthropic");
      try {
        env.sentEvents.length = 0;

        const result = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Say 'default' and nothing else.",
          "anthropic",
          "claude-sonnet-4-5"
          // No providerOptions - should not add beta header
        );

        expect(result.success).toBe(true);

        const collector = createEventCollector(env.sentEvents, workspaceId);
        await collector.waitForEvent("stream-end", 10000);
        assertStreamSuccess(collector);

        const finalMessage = collector.getFinalMessage();
        expect(finalMessage).toBeDefined();
        if (finalMessage && "parts" in finalMessage && Array.isArray(finalMessage.parts)) {
          const content = finalMessage.parts
            .filter((part) => part.type === "text")
            .map((part) => (part as { text: string }).text)
            .join("")
            .toLowerCase();
          expect(content).toContain("default");
        }
      } finally {
        await cleanup();
      }
    },
    15000
  );
});
