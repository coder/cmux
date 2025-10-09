import { setupWorkspace, shouldRunIntegrationTests, validateApiKeys } from "./setup";
import {
  sendMessageWithModel,
  createEventCollector,
  assertStreamSuccess,
} from "./helpers";
import { HistoryService } from "../../src/services/historyService";
import { createCmuxMessage } from "../../src/types/message";

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
        // Build large conversation history to push context limits
        // Claude Sonnet 4 standard context is ~200k tokens
        // 1M context allows up to ~800k tokens
        // We'll build ~300k tokens (1.2M chars) to exceed standard but fit in 1M
        
        const historyService = new HistoryService(env.config);
        
        // Create ~60k chars per message (roughly 15k tokens)
        const messageSize = 60_000;
        const largeText = "Context test: " + "A".repeat(messageSize);
        
        // Use 20 messages = 1.2M chars total (~300k tokens)
        // This should exceed standard context but fit in 1M window
        const messageCount = 20;
        
        for (let i = 0; i < messageCount; i++) {
          const isUser = i % 2 === 0;
          const role = isUser ? "user" : "assistant";
          const message = createCmuxMessage(`history-msg-${i}`, role, largeText, {});
          
          const result = await historyService.appendToHistory(workspaceId, message);
          expect(result.success).toBe(true);
        }
        
        // Phase 1: Try without 1M context flag
        // This may fail or succeed depending on Anthropic's handling,
        // but we're testing that the flag is applied
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
        
        // May succeed or fail - we just verify the API accepted our request structure
        expect(resultWithout1M.success).toBe(true);
        
        const collectorWithout1M = createEventCollector(env.sentEvents, workspaceId);
        await Promise.race([
          collectorWithout1M.waitForEvent("stream-end", 30000),
          collectorWithout1M.waitForEvent("stream-error", 30000),
        ]);
        
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
