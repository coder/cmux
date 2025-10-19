/**
 * Stream Error Recovery Integration Tests
 *
 * These tests verify the "no amnesia" fix - ensuring that when a stream is interrupted
 * by an error (network failure, API error, etc.), the accumulated content is preserved
 * and available when the stream is resumed.
 *
 * Test Approach:
 * - Focus on user-level behavior (can send message, can resume, content is delivered)
 * - Avoid coupling to internal implementation (no direct file access, no metadata checks)
 * - Use existing helpers (readChatHistory, waitForStreamSuccess) instead of custom solutions
 * - Verify outcomes (substantial content, topic-relevant content) not internal state
 *
 * These tests use a debug IPC channel to artificially trigger errors, allowing us to
 * test the recovery path without relying on actual network failures.
 */

import { setupWorkspace, shouldRunIntegrationTests, validateApiKeys } from "./setup";
import {
  sendMessageWithModel,
  createEventCollector,
  waitForStreamSuccess,
  readChatHistory,
} from "./helpers";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

// Validate API keys before running tests
if (shouldRunIntegrationTests()) {
  validateApiKeys(["ANTHROPIC_API_KEY"]);
}

// Use Haiku 4.5 for speed
const PROVIDER = "anthropic";
const MODEL = "claude-haiku-4-5";

/**
 * Helper: Wait for stream to accumulate some content before triggering error
 * This ensures we have context to preserve
 */
async function waitForStreamWithContent(
  collector: ReturnType<typeof createEventCollector>,
  timeoutMs = 10000
): Promise<void> {
  await collector.waitForEvent("stream-start", 5000);
  await collector.waitForEvent("stream-delta", timeoutMs);
}

/**
 * Helper: Trigger an error in an active stream
 */
async function triggerStreamError(
  mockIpcRenderer: unknown,
  workspaceId: string,
  errorMessage: string
): Promise<void> {
  const result = await (mockIpcRenderer as { invoke: (channel: string, ...args: unknown[]) => Promise<{ success: boolean }> }).invoke(
    IPC_CHANNELS.DEBUG_TRIGGER_STREAM_ERROR,
    workspaceId,
    errorMessage
  );
  if (!result.success) {
    throw new Error(`Failed to trigger stream error: ${errorMessage}`);
  }
}

/**
 * Helper: Resume stream and wait for successful completion
 */
async function resumeAndWaitForSuccess(
  mockIpcRenderer: unknown,
  workspaceId: string,
  sentEvents: Array<{ channel: string; data: unknown }>,
  model: string,
  timeoutMs = 15000
): Promise<void> {
  const resumeResult = await (mockIpcRenderer as { invoke: (channel: string, ...args: unknown[]) => Promise<{ success: boolean; error?: string }> }).invoke(
    IPC_CHANNELS.WORKSPACE_RESUME_STREAM,
    workspaceId,
    { model }
  );
  
  if (!resumeResult.success) {
    throw new Error(`Resume failed: ${resumeResult.error}`);
  }

  // Wait for successful completion
  await waitForStreamSuccess(sentEvents, workspaceId, timeoutMs);
}

describeIntegration("Stream Error Recovery (No Amnesia)", () => {
  // Enable retries in CI for flaky API tests
  if (process.env.CI && typeof jest !== "undefined" && jest.retryTimes) {
    jest.retryTimes(3, { logErrorsBeforeRetry: true });
  }

  test.concurrent(
    "should preserve context after single stream error",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace(PROVIDER);
      try {
        // User sends a message requesting substantial content
        const sendResult = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Write a 500-word essay about the history of computing",
          PROVIDER,
          MODEL
        );
        expect(sendResult.success).toBe(true);

        // Wait for stream to accumulate content
        const collector = createEventCollector(env.sentEvents, workspaceId);
        await waitForStreamWithContent(collector);

        // Simulate network error mid-stream
        await triggerStreamError(env.mockIpcRenderer, workspaceId, "Network connection lost");

        // Wait for error to be processed
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Get history before resume - should have user message and partial assistant response
        const historyBeforeResume = await readChatHistory(env.tempDir, workspaceId);
        const assistantMessagesBefore = historyBeforeResume.filter((m) => m.role === "assistant");
        expect(assistantMessagesBefore.length).toBeGreaterThanOrEqual(1);

        // User can resume after error
        await resumeAndWaitForSuccess(
          env.mockIpcRenderer,
          workspaceId,
          env.sentEvents,
          `${PROVIDER}:${MODEL}`
        );

        // Verify final conversation state - user should see completed response
        const historyAfter = await readChatHistory(env.tempDir, workspaceId);
        const assistantMessagesAfter = historyAfter.filter((m) => m.role === "assistant");

        // Should have at least one assistant message with substantial content
        expect(assistantMessagesAfter.length).toBeGreaterThanOrEqual(1);

        // Get text from all assistant messages
        const allAssistantText = assistantMessagesAfter
          .flatMap((m) => m.parts)
          .filter((p) => p.type === "text")
          .map((p) => (p as { text?: string }).text ?? "")
          .join("");

        // Verify we got substantial content (no amnesia - context was preserved)
        expect(allAssistantText.length).toBeGreaterThan(100);
        
        // Content should be about computing history (shows model saw original request)
        expect(allAssistantText.toLowerCase()).toMatch(/comput(er|ing)/);
      } finally {
        await cleanup();
      }
    },
    40000
  );

  test.concurrent(
    "should handle three consecutive stream errors without amnesia",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace(PROVIDER);
      try {
        // User sends a message requesting substantial content
        const sendResult = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Write a detailed explanation of quantum mechanics in 300 words",
          PROVIDER,
          MODEL
        );
        expect(sendResult.success).toBe(true);

        // Simulate 3 consecutive network failures
        for (let i = 1; i <= 3; i++) {
          // Wait for stream to accumulate some content
          const collector = createEventCollector(env.sentEvents, workspaceId);
          await waitForStreamWithContent(collector);

          // Trigger error
          await triggerStreamError(env.mockIpcRenderer, workspaceId, `Connection timeout ${i}`);

          // Wait for error to be processed
          await new Promise((resolve) => setTimeout(resolve, 200));

          // User can resume after error (except on last error, we'll do that separately)
          if (i < 3) {
            await resumeAndWaitForSuccess(
              env.mockIpcRenderer,
              workspaceId,
              env.sentEvents,
              `${PROVIDER}:${MODEL}`,
              10000 // Shorter timeout for intermediate resumes
            );
          }
        }

        // After 3 failures, user tries one final time
        await resumeAndWaitForSuccess(
          env.mockIpcRenderer,
          workspaceId,
          env.sentEvents,
          `${PROVIDER}:${MODEL}`
        );

        // Verify final conversation - user should see completed response about quantum mechanics
        const finalHistory = await readChatHistory(env.tempDir, workspaceId);
        const assistantMessages = finalHistory.filter((m) => m.role === "assistant");
        
        expect(assistantMessages.length).toBeGreaterThanOrEqual(1);

        // Get all assistant text
        const allAssistantText = assistantMessages
          .flatMap((m) => m.parts)
          .filter((p) => p.type === "text")
          .map((p) => (p as { text?: string }).text ?? "")
          .join("");

        // Verify substantial content was delivered (no amnesia across multiple errors)
        expect(allAssistantText.length).toBeGreaterThan(100);
        
        // Content should be about quantum mechanics (shows context preserved through errors)
        expect(allAssistantText.toLowerCase()).toMatch(/quantum/);
      } finally {
        await cleanup();
      }
    },
    60000
  );
});
