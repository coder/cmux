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
 * Helper: Verify counting response shows substantial work
 * After error recovery, model may restart but should show accumulated work
 */
function verifyCountingResponse(numbers: number[]): { valid: boolean; reason?: string } {
  if (numbers.length < 5) {
    return { valid: false, reason: `Too few numbers: ${numbers.length}` };
  }

  // Verify we have a reasonable range of numbers
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const range = max - min;

  if (range < 10) {
    return { valid: false, reason: `Range too small: ${min}-${max} (${range})` };
  }

  // Verify we have decent coverage (not just 1, 1, 1, 1, 100)
  const uniqueNumbers = new Set(numbers);
  if (uniqueNumbers.size < 5) {
    return { valid: false, reason: `Too few unique numbers: ${uniqueNumbers.size}` };
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

  // Wait for several deltas to ensure we have text content
  // Early deltas might just be thinking/setup
  for (let i = 0; i < 5; i++) {
    await collector.waitForEvent("stream-delta", timeoutMs);
  }

  // Small delay to let content accumulate in streamInfo.parts
  await new Promise((resolve) => setTimeout(resolve, 200));
}

/**
 * Helper: Trigger an error in an active stream
 */
async function triggerStreamError(
  mockIpcRenderer: unknown,
  workspaceId: string,
  errorMessage: string
): Promise<void> {
  const result = await (
    mockIpcRenderer as {
      invoke: (
        channel: string,
        ...args: unknown[]
      ) => Promise<{ success: boolean; error?: string }>;
    }
  ).invoke(IPC_CHANNELS.DEBUG_TRIGGER_STREAM_ERROR, workspaceId, errorMessage);
  if (!result.success) {
    throw new Error(
      `Failed to trigger stream error: ${errorMessage}. Reason: ${result.error || "unknown"}`
    );
  }
}

/**
 * Helper: Resume stream and wait for successful completion
 * Note: For error recovery tests, we expect error events in history
 */
async function resumeAndWaitForSuccess(
  mockIpcRenderer: unknown,
  workspaceId: string,
  sentEvents: Array<{ channel: string; data: unknown }>,
  model: string,
  timeoutMs = 15000
): Promise<void> {
  // Capture event count before resume to filter old error events
  const eventCountBeforeResume = sentEvents.length;

  const resumeResult = await (
    mockIpcRenderer as {
      invoke: (
        channel: string,
        ...args: unknown[]
      ) => Promise<{ success: boolean; error?: string }>;
    }
  ).invoke(IPC_CHANNELS.WORKSPACE_RESUME_STREAM, workspaceId, { model });

  if (!resumeResult.success) {
    throw new Error(`Resume failed: ${resumeResult.error}`);
  }

  // Wait for stream-end event after resume
  const collector = createEventCollector(sentEvents, workspaceId);
  const streamEnd = await collector.waitForEvent("stream-end", timeoutMs);

  if (!streamEnd) {
    throw new Error("Stream did not complete after resume");
  }

  // Check that the resumed stream itself didn't error (ignore previous errors)
  const eventsAfterResume = sentEvents.slice(eventCountBeforeResume);
  const chatChannel = `chat:${workspaceId}`;
  const newEvents = eventsAfterResume
    .filter((e) => e.channel === chatChannel)
    .map((e) => e.data as { type?: string });

  const hasNewError = newEvents.some((e) => e.type === "stream-error");
  if (hasNewError) {
    throw new Error("Resumed stream encountered an error");
  }
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
        // User asks model to count from 1 to 100 with descriptions (slower task to allow interruption)
        const sendResult = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Count from 1 to 100. For each number, write the number followed by a brief description or fun fact. For example: '1 - The first positive integer', '2 - The only even prime number', etc. Do not use any tools.",
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
        await new Promise((resolve) => setTimeout(resolve, 500));

        // User can resume after error (this commits the partial to history and continues)
        await resumeAndWaitForSuccess(
          env.mockIpcRenderer,
          workspaceId,
          env.sentEvents,
          `${PROVIDER}:${MODEL}`
        );

        // Verify final conversation state - should have continued counting
        const historyAfter = await readChatHistory(env.tempDir, workspaceId);
        const assistantMessagesAfter = historyAfter.filter((m) => m.role === "assistant");

        // Get all numbers from all assistant messages
        const allAssistantText = assistantMessagesAfter
          .flatMap((m) => m.parts)
          .filter((p) => p.type === "text")
          .map((p) => (p as { text?: string }).text ?? "")
          .join("");
        const allNumbers = extractNumbers(allAssistantText);

        // Verify response shows substantial counting work (proves context was preserved)
        const responseCheck = verifyCountingResponse(allNumbers);
        if (!responseCheck.valid) {
          console.error("Response validation failed:", responseCheck.reason);
          console.error("Numbers found:", allNumbers.slice(0, 50));
          console.error("Unique numbers:", new Set(allNumbers).size);
          console.error("Text sample:", allAssistantText.substring(0, 300));
        }
        expect(responseCheck.valid).toBe(true);

        // Verify we got substantial progress
        const maxNumber = Math.max(...allNumbers);
        expect(maxNumber).toBeGreaterThan(5); // Should have made progress
      } finally {
        await cleanup();
      }
    },
    40000
  );
});
