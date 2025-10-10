import {
  setupWorkspace,
  shouldRunIntegrationTests,
  validateApiKeys,
  type TestEnvironment,
} from "./setup";
import { sendMessageWithModel, createEventCollector, waitFor } from "./helpers";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";
import type { Result } from "../../src/types/result";
import type { SendMessageError } from "../../src/types/errors";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

// Validate API keys before running tests
if (shouldRunIntegrationTests()) {
  validateApiKeys(["ANTHROPIC_API_KEY"]);
}

describeIntegration("IpcMain resumeStream integration tests", () => {
  // Enable retries in CI for flaky API tests
  if (process.env.CI && typeof jest !== "undefined" && jest.retryTimes) {
    jest.retryTimes(3, { logErrorsBeforeRetry: true });
  }

  test.concurrent(
    "should resume interrupted stream without new user message",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace("anthropic");
      try {
        // Start a stream with a bash command that outputs a specific word
        const expectedWord = "RESUMPTION_TEST_SUCCESS";
        void sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          `Run this bash command: sleep 5 && echo '${expectedWord}'`,
          "anthropic",
          "claude-sonnet-4-5"
        );

        // Wait for stream to start
        const collector1 = createEventCollector(env.sentEvents, workspaceId);
        const streamStartEvent = await collector1.waitForEvent("stream-start", 5000);
        expect(streamStartEvent).toBeDefined();

        // Wait for at least some content or tool call to start
        await waitFor(() => {
          collector1.collect();
          const hasToolCallStart = collector1
            .getEvents()
            .some((e) => "type" in e && e.type === "tool-call-start");
          const hasContent = collector1
            .getEvents()
            .some((e) => "type" in e && e.type === "stream-delta");
          return hasToolCallStart || hasContent;
        }, 10000);

        // Interrupt the stream by sending empty message
        const interruptResult = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "",
          "anthropic",
          "claude-sonnet-4-5"
        );
        expect(interruptResult.success).toBe(true);

        // Wait for stream to be interrupted (abort or end event)
        const streamInterrupted = await waitFor(() => {
          collector1.collect();
          const hasAbort = collector1
            .getEvents()
            .some((e) => "type" in e && e.type === "stream-abort");
          const hasEnd = collector1.getEvents().some((e) => "type" in e && e.type === "stream-end");
          return hasAbort || hasEnd;
        }, 5000);
        expect(streamInterrupted).toBe(true);

        // Count user messages before resume (should be 1)
        collector1.collect();
        const userMessagesBefore = collector1
          .getEvents()
          .filter((e) => "role" in e && e.role === "user");
        expect(userMessagesBefore.length).toBe(1);

        // Clear events to track only resume events
        env.sentEvents.length = 0;

        // Resume the stream (no new user message)
        const resumeResult = (await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_RESUME_STREAM,
          workspaceId,
          { model: "anthropic:claude-sonnet-4-5" }
        )) as Result<void, SendMessageError>;
        expect(resumeResult.success).toBe(true);

        // Collect events after resume
        const collector2 = createEventCollector(env.sentEvents, workspaceId);

        // Wait for new stream to start
        const resumeStreamStart = await collector2.waitForEvent("stream-start", 5000);
        expect(resumeStreamStart).toBeDefined();

        // Wait for stream to complete
        const streamEnd = await collector2.waitForEvent("stream-end", 30000);
        expect(streamEnd).toBeDefined();

        // Verify no new user message was created
        collector2.collect();
        const userMessagesAfter = collector2
          .getEvents()
          .filter((e) => "role" in e && e.role === "user");
        expect(userMessagesAfter.length).toBe(0); // No new user messages

        // Verify stream completed successfully (without errors)
        const streamErrors = collector2
          .getEvents()
          .filter((e) => "type" in e && e.type === "stream-error");
        expect(streamErrors.length).toBe(0);

        // Verify we received stream deltas (actual content)
        const deltas = collector2.getDeltas();
        expect(deltas.length).toBeGreaterThan(0);

        // Verify the stream-end event is present and well-formed
        expect(streamEnd).toBeDefined();
        if (streamEnd && "messageId" in streamEnd && "historySequence" in streamEnd) {
          expect(streamEnd.messageId).toBeTruthy();
          expect(streamEnd.historySequence).toBeGreaterThan(0);
        }

        // Verify we received the expected word in the output
        // This proves the bash command completed successfully after resume
        const allText = deltas
          .filter((d) => "delta" in d)
          .map((d) => ("delta" in d ? d.delta : ""))
          .join("");
        expect(allText).toContain(expectedWord);
      } finally {
        await cleanup();
      }
    },
    45000 // 45 second timeout for this test
  );

  // Define tricky message histories that could cause issues
  const trickyHistories = [
    {
      name: "reasoning-only",
      description: "Assistant message with only reasoning, no text",
      createMessage: (id: string) => ({
        id,
        role: "assistant" as const,
        parts: [{ type: "reasoning" as const, text: "Let me think about this..." }],
        metadata: { historySequence: 2, partial: true },
      }),
    },
    {
      name: "empty-text",
      description: "Assistant message with empty text content",
      createMessage: (id: string) => ({
        id,
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: "" }],
        metadata: { historySequence: 2, partial: true },
      }),
    },
    {
      name: "reasoning-then-empty-text",
      description: "Assistant message with reasoning followed by empty text",
      createMessage: (id: string) => ({
        id,
        role: "assistant" as const,
        parts: [
          { type: "reasoning" as const, text: "Thinking deeply..." },
          { type: "text" as const, text: "" },
        ],
        metadata: { historySequence: 2, partial: true },
      }),
    },
    {
      name: "multiple-reasoning-blocks",
      description: "Assistant message with multiple reasoning blocks, no text",
      createMessage: (id: string) => ({
        id,
        role: "assistant" as const,
        parts: [
          { type: "reasoning" as const, text: "First thought..." },
          { type: "reasoning" as const, text: "Second thought..." },
        ],
        metadata: { historySequence: 2, partial: true },
      }),
    },
    {
      name: "whitespace-only-text",
      description: "Assistant message with whitespace-only text content",
      createMessage: (id: string) => ({
        id,
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: "   \n\t  " }],
        metadata: { historySequence: 2, partial: true },
      }),
    },
  ];

  test.concurrent.each([
    { provider: "anthropic" as const, model: "claude-sonnet-4-5" },
    { provider: "openai" as const, model: "gpt-4o" },
  ])(
    "should handle resume with tricky message histories ($provider)",
    async ({ provider, model }) => {
      const { HistoryService } = await import("../../src/services/historyService");
      const { createCmuxMessage } = await import("../../src/types/message");

      for (const history of trickyHistories) {
        const { env, workspaceId, cleanup } = await setupWorkspace(provider);
        try {
          // Create history service to directly manipulate messages
          const historyService = new HistoryService(env.config);

          // Create a user message first
          const userMessage = createCmuxMessage(
            `user-${Date.now()}`,
            "user",
            "Please help me with this task.",
            { historySequence: 1 }
          );

          const userAppendResult = await historyService.appendToHistory(
            workspaceId,
            userMessage
          );
          expect(userAppendResult.success).toBe(true);

          // Create the tricky assistant message
          const trickyMessage = history.createMessage(`assistant-${Date.now()}`);

          // Append the tricky message to history
          const appendResult = await historyService.appendToHistory(
            workspaceId,
            trickyMessage
          );
          expect(appendResult.success).toBe(true);

          // Clear events before resume
          env.sentEvents.length = 0;

          // Resume the stream with thinking enabled
          // This exercises the context-aware filtering logic
          const resumeResult = (await env.mockIpcRenderer.invoke(
            IPC_CHANNELS.WORKSPACE_RESUME_STREAM,
            workspaceId,
            { model: `${provider}:${model}`, thinkingLevel: "high" }
          )) as Result<void, SendMessageError>;

          // Should succeed for all tricky histories with the fix
          if (!resumeResult.success) {
            console.error(
              `[${provider}/${history.name}] Failed to resume:`,
              resumeResult.error
            );
          }
          expect(resumeResult.success).toBe(true);

          // Verify the stream completes successfully
          const collector = createEventCollector(env.sentEvents, workspaceId);
          const streamEnd = await collector.waitForEvent("stream-end", 30000);
          expect(streamEnd).toBeDefined();

          // Verify no errors occurred during streaming
          collector.collect();
          const streamErrors = collector
            .getEvents()
            .filter((e) => "type" in e && e.type === "stream-error");

          if (streamErrors.length > 0) {
            console.error(
              `[${provider}/${history.name}] Stream errors:`,
              streamErrors
            );
          }
          expect(streamErrors.length).toBe(0);

          // Verify we received some content
          const deltas = collector.getDeltas();
          expect(deltas.length).toBeGreaterThan(0);
        } finally {
          await cleanup();
        }
      }
    },
    90000 // 90 second timeout - testing multiple scenarios per provider
  );
});
