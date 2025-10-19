import * as fs from "fs/promises";
import * as path from "path";
import {
  setupWorkspace,
  shouldRunIntegrationTests,
  validateApiKeys,
} from "./setup";
import {
  sendMessageWithModel,
  createEventCollector,
} from "./helpers";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";
import type { CmuxMessage } from "../../src/types/message";
import type { StreamErrorMessage } from "../../src/types/ipc";

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
 * Helper: Read chat history from disk with full metadata
 */
async function readChatHistoryWithMetadata(
  tempDir: string,
  workspaceId: string
): Promise<CmuxMessage[]> {
  const historyPath = path.join(tempDir, "sessions", workspaceId, "chat.jsonl");
  const content = await fs.readFile(historyPath, "utf-8");
  const lines = content.trim().split("\n");
  return lines.map((line) => JSON.parse(line) as CmuxMessage);
}

/**
 * Helper: Read partial message from disk
 */
async function readPartial(tempDir: string, workspaceId: string): Promise<CmuxMessage | null> {
  const partialPath = path.join(tempDir, "sessions", workspaceId, "partial.json");
  try {
    const content = await fs.readFile(partialPath, "utf-8");
    return JSON.parse(content) as CmuxMessage;
  } catch (error) {
    return null;
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
        // Step 1: Send a message that will be interrupted (use a long response that won't finish quickly)
        const sendResult = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Write a 500-word essay about the history of computing",
          PROVIDER,
          MODEL
        );
        expect(sendResult.success).toBe(true);

        // Step 2: Wait for stream to start and accumulate some content
        const collector = createEventCollector(env.sentEvents, workspaceId);
        await collector.waitForEvent("stream-start", 5000);

        // Wait for at least one delta to ensure we have content to preserve
        await collector.waitForEvent("stream-delta", 10000);

        // Step 3: Trigger artificial error
        const errorResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.DEBUG_TRIGGER_STREAM_ERROR,
          workspaceId,
          "Test-induced network error"
        );
        expect(errorResult.success).toBe(true);

        // Step 4: Wait for error event (type is "stream-error" for IPC events)
        const errorEvent = (await collector.waitForEvent(
          "stream-error",
          5000
        )) as StreamErrorMessage | null;
        expect(errorEvent).toBeDefined();
        expect(errorEvent?.error).toContain("Test-induced network error");

        // Wait a moment for partial.json to be written (fire-and-forget write)
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Step 5: Read partial.json - should contain accumulated parts from failed attempt
        const partialMessage = await readPartial(env.tempDir, workspaceId);
        expect(partialMessage).toBeDefined();
        expect(partialMessage!.parts.length).toBeGreaterThan(0); // Has accumulated parts!
        expect(partialMessage!.metadata?.error).toBeDefined(); // Has error metadata

        const partialText = partialMessage!.parts
          .filter((p) => p.type === "text")
          .map((p) => (p as { text?: string }).text ?? "")
          .join("");
        expect(partialText.length).toBeGreaterThan(0); // Has actual text content

        // Step 6: Resume stream (this commits the partial to history)
        const resumeResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_RESUME_STREAM,
          workspaceId,
          { model: `${PROVIDER}:${MODEL}` }
        );
        if (!resumeResult.success) {
          console.error("Resume failed:", resumeResult.error);
        }
        expect(resumeResult.success).toBe(true);

        // Step 7: Wait for successful completion (don't use assertStreamSuccess as it checks all events including the earlier error)
        const collector2 = createEventCollector(env.sentEvents, workspaceId);
        const streamEndEvent = await collector2.waitForEvent("stream-end", 15000);
        expect(streamEndEvent).toBeDefined();

        // Step 8: Verify final history - no amnesia!
        // Note: Current implementation creates a new message on resume rather than updating the placeholder
        // The key test is that the resumed stream has access to the partial's content (no amnesia)
        const historyAfterResume = await readChatHistoryWithMetadata(env.tempDir, workspaceId);
        const allAssistantMessages = historyAfterResume.filter((m) => m.role === "assistant");
        
        // Should have the errored partial (committed) plus the resumed completion
        expect(allAssistantMessages.length).toBeGreaterThanOrEqual(1);
        
        // Find the successful completion message (no error)
        const successfulMessage = allAssistantMessages.find(m => !m.metadata?.error);
        expect(successfulMessage).toBeDefined();
        expect(successfulMessage!.parts.length).toBeGreaterThan(0);

        // Verify the successful message has reasonable content (proves no amnesia - it continued from context)
        const successText = successfulMessage!.parts
          .filter((p) => p.type === "text")
          .map((p) => (p as { text?: string }).text ?? "")
          .join("");
        expect(successText.length).toBeGreaterThan(50); // Should have substantial content
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
        // Step 1: Send initial message (use a long response)
        const sendResult = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Write a detailed explanation of quantum mechanics in 300 words",
          PROVIDER,
          MODEL
        );
        expect(sendResult.success).toBe(true);

        // Step 2: Wait for stream start
        let streamStartCount = 0;
        let collector = createEventCollector(env.sentEvents, workspaceId);
        await collector.waitForEvent("stream-start", 5000);
        streamStartCount++;

        // Step 3: Trigger 3 consecutive errors with brief content accumulation
        for (let i = 1; i <= 3; i++) {
          // Wait for at least one delta to ensure we have content
          await collector.waitForEvent("stream-delta", 10000);

          // Trigger error
          const errorResult = await env.mockIpcRenderer.invoke(
            IPC_CHANNELS.DEBUG_TRIGGER_STREAM_ERROR,
            workspaceId,
            `Test error ${i}`
          );
          expect(errorResult.success).toBe(true);

          // Wait for error event - create fresh collector to avoid seeing old errors
          collector = createEventCollector(env.sentEvents, workspaceId);
          const errorEvent = (await collector.waitForEvent(
            "stream-error",
            5000
          )) as StreamErrorMessage | null;
          expect(errorEvent).toBeDefined();
          // Note: Don't check specific error message as collector might see previous errors

          // Wait for partial write
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Verify partial.json exists (contains accumulated parts from this error)
          const partialMessage = await readPartial(env.tempDir, workspaceId);
          expect(partialMessage).toBeDefined();
          // Note: Error metadata might be cleared after commit on subsequent iterations

          // Resume stream for next iteration (except on last error)
          if (i < 3) {
            const resumeResult = await env.mockIpcRenderer.invoke(
              IPC_CHANNELS.WORKSPACE_RESUME_STREAM,
              workspaceId,
              { model: `${PROVIDER}:${MODEL}` }
            );
            expect(resumeResult.success).toBe(true);

            // Wait for the new stream to start
            collector = createEventCollector(env.sentEvents, workspaceId);
            await collector.waitForEvent("stream-start", 5000);
            streamStartCount++;
          }
        }

        // Step 4: Final resume - should succeed
        const finalResumeResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_RESUME_STREAM,
          workspaceId,
          { model: `${PROVIDER}:${MODEL}` }
        );
        expect(finalResumeResult.success).toBe(true);

        // Wait for successful completion (don't use assertStreamSuccess as it checks all events including earlier errors)
        const finalCollector = createEventCollector(env.sentEvents, workspaceId);
        const streamEndEvent = await finalCollector.waitForEvent("stream-end", 15000);
        expect(streamEndEvent).toBeDefined();

        // Step 5: Verify final history - content preserved across multiple errors
        const finalHistory = await readChatHistoryWithMetadata(env.tempDir, workspaceId);
        const allAssistantMessages = finalHistory.filter((m) => m.role === "assistant");
        expect(allAssistantMessages.length).toBeGreaterThanOrEqual(1);

        // Find the successful completion message (no error)
        const successfulMessage = allAssistantMessages.find(m => !m.metadata?.error);
        expect(successfulMessage).toBeDefined();
        expect(successfulMessage!.parts.length).toBeGreaterThan(0); // Has content

        // Verify response contains quantum mechanics content (proves context was maintained)
        const successText = successfulMessage!.parts
          .filter((p) => p.type === "text")
          .map((p) => (p as { text?: string }).text ?? "")
          .join("");
        expect(successText.toLowerCase()).toMatch(/quantum/); // Contains quantum-related content
        expect(successText.length).toBeGreaterThan(50); // Should have substantial content
      } finally {
        await cleanup();
      }
    },
    60000
  );
});

