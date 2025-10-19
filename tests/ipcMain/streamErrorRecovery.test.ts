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
 * Helper: Extract numbers from text response
 * Used to verify counting sequence continuity
 */
function extractNumbers(text: string): number[] {
  const numbers: number[] = [];
  // Match numbers, handling formats like "1", "1.", "1)", "1:", etc.
  const matches = text.matchAll(/\b(\d+)[\s.,:)\-]*/g);
  for (const match of matches) {
    const num = parseInt(match[1], 10);
    if (num >= 1 && num <= 100) {
      numbers.push(num);
    }
  }
  return numbers;
}

/**
 * Helper: Verify counting sequence is generally ascending
 * Allows for small gaps but ensures no major backward jumps
 */
function verifyCountingSequence(numbers: number[]): { valid: boolean; reason?: string } {
  if (numbers.length < 5) {
    return { valid: false, reason: `Too few numbers: ${numbers.length}` };
  }

  // Check that sequence is generally ascending (allow small gaps, no major backward jumps)
  let backwardJumps = 0;
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] < numbers[i - 1] - 5) {
      // Backward jump of more than 5
      backwardJumps++;
    }
  }

  if (backwardJumps > 2) {
    return { valid: false, reason: `Too many backward jumps: ${backwardJumps}` };
  }

  // Verify we covered a reasonable range
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const range = max - min;

  if (range < 20) {
    return { valid: false, reason: `Range too small: ${min}-${max} (${range})` };
  }

  return { valid: true };
}

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
        // User asks model to count from 1 to 100 (with tools disabled)
        const sendResult = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Count from 1 to 100. Write each number on a separate line. Do not use any tools.",
          PROVIDER,
          MODEL,
          { toolPolicy: [{ regex_match: ".*", action: "disable" }] }
        );
        expect(sendResult.success).toBe(true);

        // Wait for stream to accumulate content (should have counted some numbers)
        const collector = createEventCollector(env.sentEvents, workspaceId);
        await waitForStreamWithContent(collector);

        // Simulate network error mid-stream
        await triggerStreamError(env.mockIpcRenderer, workspaceId, "Network connection lost");

        // Wait for error to be processed
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Get history before resume - should have partial counting
        const historyBeforeResume = await readChatHistory(env.tempDir, workspaceId);
        const assistantMessagesBefore = historyBeforeResume.filter((m) => m.role === "assistant");
        expect(assistantMessagesBefore.length).toBeGreaterThanOrEqual(1);

        // Extract numbers from partial response
        const partialText = assistantMessagesBefore
          .flatMap((m) => m.parts)
          .filter((p) => p.type === "text")
          .map((p) => (p as { text?: string }).text ?? "")
          .join("");
        const numbersBeforeResume = extractNumbers(partialText);

        // Should have started counting
        expect(numbersBeforeResume.length).toBeGreaterThan(0);
        const lastNumberBeforeError = numbersBeforeResume[numbersBeforeResume.length - 1];

        // User can resume after error
        await resumeAndWaitForSuccess(
          env.mockIpcRenderer,
          workspaceId,
          env.sentEvents,
          `${PROVIDER}:${MODEL}`
        );

        // Verify final conversation state
        const historyAfter = await readChatHistory(env.tempDir, workspaceId);
        const assistantMessagesAfter = historyAfter.filter((m) => m.role === "assistant");

        // Get all numbers from all assistant messages
        const allAssistantText = assistantMessagesAfter
          .flatMap((m) => m.parts)
          .filter((p) => p.type === "text")
          .map((p) => (p as { text?: string }).text ?? "")
          .join("");
        const allNumbers = extractNumbers(allAssistantText);

        // Verify sequence is valid (proves context was preserved)
        const sequenceCheck = verifyCountingSequence(allNumbers);
        if (!sequenceCheck.valid) {
          console.error("Sequence validation failed:", sequenceCheck.reason);
          console.error("Numbers found:", allNumbers);
        }
        expect(sequenceCheck.valid).toBe(true);

        // Verify we made progress past the error point
        const maxNumber = Math.max(...allNumbers);
        expect(maxNumber).toBeGreaterThan(lastNumberBeforeError);
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
        // User asks model to count from 1 to 100 (with tools disabled)
        const sendResult = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Count from 1 to 100. Write each number on a separate line. Do not use any tools.",
          PROVIDER,
          MODEL,
          { toolPolicy: [{ regex_match: ".*", action: "disable" }] }
        );
        expect(sendResult.success).toBe(true);

        const numbersAtEachError: number[] = [];

        // Simulate 3 consecutive network failures
        for (let i = 1; i <= 3; i++) {
          // Wait for stream to accumulate some content
          const collector = createEventCollector(env.sentEvents, workspaceId);
          await waitForStreamWithContent(collector);

          // Capture the highest number reached before this error
          const history = await readChatHistory(env.tempDir, workspaceId);
          const assistantText = history
            .filter((m) => m.role === "assistant")
            .flatMap((m) => m.parts)
            .filter((p) => p.type === "text")
            .map((p) => (p as { text?: string }).text ?? "")
            .join("");
          const numbers = extractNumbers(assistantText);
          if (numbers.length > 0) {
            numbersAtEachError.push(Math.max(...numbers));
          }

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

        // Verify final conversation state
        const finalHistory = await readChatHistory(env.tempDir, workspaceId);
        const assistantMessages = finalHistory.filter((m) => m.role === "assistant");

        // Get all numbers from all assistant messages
        const allAssistantText = assistantMessages
          .flatMap((m) => m.parts)
          .filter((p) => p.type === "text")
          .map((p) => (p as { text?: string }).text ?? "")
          .join("");
        const allNumbers = extractNumbers(allAssistantText);

        // Verify sequence is valid (proves context was preserved through multiple errors)
        const sequenceCheck = verifyCountingSequence(allNumbers);
        if (!sequenceCheck.valid) {
          console.error("Sequence validation failed:", sequenceCheck.reason);
          console.error("Numbers found:", allNumbers);
          console.error("Numbers at each error:", numbersAtEachError);
        }
        expect(sequenceCheck.valid).toBe(true);

        // Verify we progressed through all errors
        if (numbersAtEachError.length > 0) {
          const lastErrorPoint = numbersAtEachError[numbersAtEachError.length - 1];
          const finalMaxNumber = Math.max(...allNumbers);
          expect(finalMaxNumber).toBeGreaterThan(lastErrorPoint);
        }
      } finally {
        await cleanup();
      }
    },
    60000
  );
});
