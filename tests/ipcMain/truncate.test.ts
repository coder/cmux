import { setupWorkspace, shouldRunIntegrationTests, validateApiKeys } from "./setup";
import {
  sendMessageWithModel,
  createEventCollector,
  assertStreamSuccess,
  waitFor,
} from "./helpers";
import { HistoryService } from "../../src/services/historyService";
import { createCmuxMessage } from "../../src/types/message";
import type { DeleteMessage } from "../../src/types/ipc";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

// Validate API keys before running tests
if (shouldRunIntegrationTests()) {
  validateApiKeys(["ANTHROPIC_API_KEY"]);
}

describeIntegration("IpcMain truncate integration tests", () => {
  // Enable retries in CI for flaky API tests
  if (process.env.CI && typeof jest !== "undefined" && jest.retryTimes) {
    jest.retryTimes(3, { logErrorsBeforeRetry: true });
  }

  test.concurrent(
    "should truncate 50% of chat history and verify context is updated",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace("anthropic");
      try {
        const historyService = new HistoryService(env.config);

        // Prepopulate chat with messages (avoid API calls)
        // Create messages with a unique word in the first message
        const uniqueWord = `testword-${Date.now()}`;
        const messages = [
          createCmuxMessage("msg-1", "user", `Remember this word: ${uniqueWord}`, {}),
          createCmuxMessage("msg-2", "assistant", "I will remember that word.", {}),
          createCmuxMessage("msg-3", "user", "What is 2+2?", {}),
          createCmuxMessage("msg-4", "assistant", "4", {}),
          createCmuxMessage("msg-5", "user", "What is 3+3?", {}),
          createCmuxMessage("msg-6", "assistant", "6", {}),
        ];

        // Append messages to history
        for (const msg of messages) {
          const result = await historyService.appendToHistory(workspaceId, msg);
          expect(result.success).toBe(true);
        }

        // Clear sent events to track truncate operation
        env.sentEvents.length = 0;

        // Truncate 50% of history
        const truncateResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_TRUNCATE_HISTORY,
          workspaceId,
          { type: "percentage", value: 0.5 }
        );
        expect(truncateResult.success).toBe(true);

        // Wait for DeleteMessage to be sent
        const deleteReceived = await waitFor(
          () =>
            env.sentEvents.some(
              (event) =>
                event.data &&
                typeof event.data === "object" &&
                "type" in event.data &&
                event.data.type === "delete"
            ),
          5000
        );
        expect(deleteReceived).toBe(true);

        // Verify DeleteMessage was sent
        const deleteMessages = env.sentEvents.filter(
          (event) =>
            event.data &&
            typeof event.data === "object" &&
            "type" in event.data &&
            event.data.type === "delete"
        ) as Array<{ channel: string; data: DeleteMessage }>;
        expect(deleteMessages.length).toBeGreaterThan(0);

        // Verify some historySequences were deleted
        const deleteMsg = deleteMessages[0].data;
        expect(deleteMsg.historySequences.length).toBeGreaterThan(0);

        // Clear events again before sending verification message
        env.sentEvents.length = 0;

        // Send a message asking AI to repeat the word from the beginning
        // This should fail or return "I don't know" because context was truncated
        const result = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "What was the word I asked you to remember at the beginning? Reply with just the word or 'I don't know'."
        );

        expect(result.success).toBe(true);

        // Wait for response
        const collector = createEventCollector(env.sentEvents, workspaceId);
        await collector.waitForEvent("stream-end", 10000);
        assertStreamSuccess(collector);

        // Get response content
        const finalMessage = collector.getFinalMessage();
        expect(finalMessage).toBeDefined();

        if (finalMessage && "parts" in finalMessage && Array.isArray(finalMessage.parts)) {
          const content = finalMessage.parts
            .filter((part) => part.type === "text")
            .map((part) => (part as { text: string }).text)
            .join("");

          // The word should NOT be in the response (context was truncated)
          // AI should say it doesn't know or doesn't have that information
          expect(content.toLowerCase()).not.toContain(uniqueWord.toLowerCase());
        }
      } finally {
        await cleanup();
      }
    },
    30000
  );

  test.concurrent(
    "should truncate 100% of chat history and verify context is cleared",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace("anthropic");
      try {
        const historyService = new HistoryService(env.config);

        // Prepopulate chat with messages (avoid API calls)
        const uniqueWord = `testword-${Date.now()}`;
        const messages = [
          createCmuxMessage("msg-1", "user", `Remember this word: ${uniqueWord}`, {}),
          createCmuxMessage("msg-2", "assistant", "I will remember that word.", {}),
          createCmuxMessage("msg-3", "user", "Tell me a fact about cats", {}),
          createCmuxMessage("msg-4", "assistant", "Cats sleep 12-16 hours a day.", {}),
        ];

        // Append messages to history
        for (const msg of messages) {
          const result = await historyService.appendToHistory(workspaceId, msg);
          expect(result.success).toBe(true);
        }

        // Clear sent events to track truncate operation
        env.sentEvents.length = 0;

        // Truncate 100% of history (full clear)
        const truncateResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_TRUNCATE_HISTORY,
          workspaceId,
          { type: "percentage", value: 1.0 }
        );
        expect(truncateResult.success).toBe(true);

        // Wait for DeleteMessage to be sent
        const deleteReceived = await waitFor(
          () =>
            env.sentEvents.some(
              (event) =>
                event.data &&
                typeof event.data === "object" &&
                "type" in event.data &&
                event.data.type === "delete"
            ),
          5000
        );
        expect(deleteReceived).toBe(true);

        // Verify DeleteMessage was sent
        const deleteMessages = env.sentEvents.filter(
          (event) =>
            event.data &&
            typeof event.data === "object" &&
            "type" in event.data &&
            event.data.type === "delete"
        ) as Array<{ channel: string; data: DeleteMessage }>;
        expect(deleteMessages.length).toBeGreaterThan(0);

        // Verify all messages were deleted
        const deleteMsg = deleteMessages[0].data;
        expect(deleteMsg.historySequences.length).toBe(messages.length);

        // Clear events again before sending verification message
        env.sentEvents.length = 0;

        // Send a message asking AI to repeat the word from the beginning
        // This should definitely fail since all history was cleared
        const result = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "What was the word I asked you to remember? Reply with just the word or 'I don't know'."
        );

        expect(result.success).toBe(true);

        // Wait for response
        const collector = createEventCollector(env.sentEvents, workspaceId);
        await collector.waitForEvent("stream-end", 10000);
        assertStreamSuccess(collector);

        // Get response content
        const finalMessage = collector.getFinalMessage();
        expect(finalMessage).toBeDefined();

        if (finalMessage && "parts" in finalMessage && Array.isArray(finalMessage.parts)) {
          const content = finalMessage.parts
            .filter((part) => part.type === "text")
            .map((part) => (part as { text: string }).text)
            .join("");

          // The word should definitely NOT be in the response (all history cleared)
          expect(content.toLowerCase()).not.toContain(uniqueWord.toLowerCase());
          // AI should indicate it doesn't know
          const lowerContent = content.toLowerCase();
          expect(
            lowerContent.includes("don't know") ||
              lowerContent.includes("don't have") ||
              lowerContent.includes("no information") ||
              lowerContent.includes("not sure") ||
              lowerContent.includes("can't recall")
          ).toBe(true);
        }
      } finally {
        await cleanup();
      }
    },
    30000
  );

  test.concurrent(
    "should block truncate during active stream and require Esc first",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace("anthropic");
      try {
        const historyService = new HistoryService(env.config);

        // Prepopulate some history
        const uniqueWord = `testword-${Date.now()}`;
        const messages = [
          createCmuxMessage("msg-1", "user", `Remember this word: ${uniqueWord}`, {}),
          createCmuxMessage("msg-2", "assistant", "I will remember that word.", {}),
        ];

        for (const msg of messages) {
          const result = await historyService.appendToHistory(workspaceId, msg);
          expect(result.success).toBe(true);
        }

        // Clear events before starting stream
        env.sentEvents.length = 0;

        // Start a long-running stream
        void sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Run this bash command: sleep 30 && echo done"
        );

        // Wait for stream to start
        const startCollector = createEventCollector(env.sentEvents, workspaceId);
        await startCollector.waitForEvent("stream-start", 10000);

        // Try to truncate during active stream - should be blocked
        const truncateResultWhileStreaming = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_TRUNCATE_HISTORY,
          workspaceId,
          { type: "percentage", value: 1.0 }
        );
        expect(truncateResultWhileStreaming.success).toBe(false);
        expect(truncateResultWhileStreaming.error).toContain("stream is active");
        expect(truncateResultWhileStreaming.error).toContain("Press Esc");

        // Test passed - truncate was successfully blocked during active stream
      } finally {
        await cleanup();
      }
    },
    15000
  );

  test.concurrent(
    "should truncate history up to a specific historySequence (Start Here feature)",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace("anthropic");
      try {
        const historyService = new HistoryService(env.config);

        // Prepopulate chat with messages
        const uniqueWord = `testword-${Date.now()}`;
        const messages = [
          createCmuxMessage("msg-1", "user", `Remember this word: ${uniqueWord}`, {}),
          createCmuxMessage("msg-2", "assistant", "I will remember that word.", {}),
          createCmuxMessage("msg-3", "user", "What is 2+2?", {}),
          createCmuxMessage("msg-4", "assistant", "4", {}),
          createCmuxMessage("msg-5", "user", "What is 3+3?", {}),
          createCmuxMessage("msg-6", "assistant", "6", {}),
        ];

        // Append messages to history
        for (const msg of messages) {
          const result = await historyService.appendToHistory(workspaceId, msg);
          expect(result.success).toBe(true);
        }

        // Get history to collect historySequences
        const getHistoryResult = await historyService.getHistory(workspaceId);
        expect(getHistoryResult.success).toBe(true);
        expect(getHistoryResult.success && getHistoryResult.data.length).toBe(messages.length);

        const historySequences = getHistoryResult.success
          ? getHistoryResult.data.map((msg) => msg.metadata?.historySequence ?? -1)
          : [];

        // Verify we have all sequences
        expect(historySequences.length).toBe(messages.length);
        expect(historySequences.every((seq) => seq >= 0)).toBe(true);

        // Clear sent events to track truncate operation
        env.sentEvents.length = 0;

        // Truncate up to historySequence of msg-4 (4th message)
        // This should remove msg-1, msg-2, msg-3 and keep msg-4, msg-5, msg-6
        const targetSequence = historySequences[3]; // msg-4's sequence
        const truncateResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_TRUNCATE_HISTORY,
          workspaceId,
          { type: "upTo", historySequence: targetSequence }
        );
        expect(truncateResult.success).toBe(true);

        // Wait for DeleteMessage to be sent
        const deleteReceived = await waitFor(
          () =>
            env.sentEvents.some(
              (event) =>
                event.data &&
                typeof event.data === "object" &&
                "type" in event.data &&
                event.data.type === "delete"
            ),
          5000
        );
        expect(deleteReceived).toBe(true);

        // Verify DeleteMessage was sent with correct sequences
        const deleteMessages = env.sentEvents.filter(
          (event) =>
            event.data &&
            typeof event.data === "object" &&
            "type" in event.data &&
            event.data.type === "delete"
        ) as Array<{ channel: string; data: DeleteMessage }>;
        expect(deleteMessages.length).toBeGreaterThan(0);

        const deleteMsg = deleteMessages[0].data;
        // Should have deleted 3 messages (msg-1, msg-2, msg-3)
        expect(deleteMsg.historySequences.length).toBe(3);
        // Verify the deleted sequences are the first 3
        expect(deleteMsg.historySequences).toEqual(historySequences.slice(0, 3));

        // Verify remaining history
        const historyResult = await historyService.getHistory(workspaceId);
        expect(historyResult.success).toBe(true);
        if (historyResult.success) {
          // Should have 3 messages remaining (msg-4, msg-5, msg-6)
          expect(historyResult.data.length).toBe(3);
          // Verify these are the correct messages
          expect(historyResult.data[0].id).toBe("msg-4");
          expect(historyResult.data[1].id).toBe("msg-5");
          expect(historyResult.data[2].id).toBe("msg-6");
        }

        // Clear events again before sending verification message
        env.sentEvents.length = 0;

        // Send a message asking AI to repeat the word from the beginning
        // This should fail because msg-1 (with the word) was truncated
        const result = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "What was the word I asked you to remember? Reply with just the word or 'I don't know'."
        );

        expect(result.success).toBe(true);

        // Wait for response
        const collector = createEventCollector(env.sentEvents, workspaceId);
        await collector.waitForEvent("stream-end", 10000);
        assertStreamSuccess(collector);

        // Get response content
        const finalMessage = collector.getFinalMessage();
        expect(finalMessage).toBeDefined();

        if (finalMessage && "parts" in finalMessage && Array.isArray(finalMessage.parts)) {
          const content = finalMessage.parts
            .filter((part) => part.type === "text")
            .map((part) => (part as { text: string }).text)
            .join("");

          // The word should NOT be in the response (it was in a truncated message)
          expect(content.toLowerCase()).not.toContain(uniqueWord.toLowerCase());
        }
      } finally {
        await cleanup();
      }
    },
    30000
  );
});
