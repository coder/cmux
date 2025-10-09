import { setupWorkspace, shouldRunIntegrationTests, validateApiKeys } from "./setup";
import {
  sendMessageWithModel,
  createEventCollector,
  assertStreamSuccess,
  buildLargeHistory,
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
    "should handle larger context with 1M flag enabled vs standard limits",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace("anthropic");
      try {
        // Build large conversation history to exceed 200k token limit
        // Standard limit: 200k tokens
        // 1M context: up to 1M tokens
        // We need ~210k tokens to reliably exceed standard limit
        // Using 20 messages of 50k chars = 1M chars ≈ 210k tokens (accounting for overhead)
        await buildLargeHistory(workspaceId, env.config, {
          messageSize: 50_000,
          messageCount: 20,
          textPrefix: "Context test: ",
        });
        
        // Phase 1: Try without 1M context flag - should fail with context limit error
        env.sentEvents.length = 0;
        const resultWithout1M = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Summarize the context above in one word.",
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
        const resultType = await Promise.race([
          collectorWithout1M.waitForEvent("stream-end", 30000).then(() => "success"),
          collectorWithout1M.waitForEvent("stream-error", 30000).then(() => "error"),
        ]);
        
        // Should get an error due to exceeding 200k token limit
        expect(resultType).toBe("error");
        const errorEvent = collectorWithout1M.getEvents().find(
          (e) => "type" in e && e.type === "stream-error"
        ) as { error: string } | undefined;
        expect(errorEvent).toBeDefined();
        expect(errorEvent!.error).toMatch(/too long|200000|maximum/i);
        
        // Phase 2: Try WITH 1M context flag
        // Should handle the large context better with beta header
        env.sentEvents.length = 0;
        const resultWith1M = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Summarize the context above in one word.",
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
        await collectorWith1M.waitForEvent("stream-end", 30000);
        
        // With 1M context, should succeed
        assertStreamSuccess(collectorWith1M);
        
        const messageWith1M = collectorWith1M.getFinalMessage();
        expect(messageWith1M).toBeDefined();
        
        // The key test: with 1M context, we should get a valid response
        // that processed the large context
        if (messageWith1M && "parts" in messageWith1M && Array.isArray(messageWith1M.parts)) {
          const content = messageWith1M.parts
            .filter((part) => part.type === "text")
            .map((part) => (part as { text: string }).text)
            .join("");
          // Should have some content (proves it processed the request)
          expect(content.length).toBeGreaterThan(0);
        }
      } finally {
        await cleanup();
      }
    },
    60000 // 1 minute timeout
  );
});
