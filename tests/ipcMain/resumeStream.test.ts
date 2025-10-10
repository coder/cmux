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
  validateApiKeys(["ANTHROPIC_API_KEY", "OPENAI_API_KEY"]);
}

describeIntegration("IpcMain resumeStream integration tests", () => {
  // Enable retries in CI for flaky API tests
  if (process.env.CI && typeof jest !== "undefined" && jest.retryTimes) {
    jest.retryTimes(3, { logErrorsBeforeRetry: true });
  }

  test.concurrent(
    "should resume interrupted stream without new user message (Anthropic)",
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

  test.concurrent(
    "should resume interrupted stream without new user message (OpenAI)",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace("openai");
      try {
        // Start a stream with a bash command that outputs a specific word
        const expectedWord = "RESUMPTION_TEST_OPENAI_SUCCESS";
        void sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          `Run this bash command: sleep 5 && echo '${expectedWord}'`,
          "openai",
          "gpt-4o"
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
          "openai",
          "gpt-4o"
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
          { model: "openai:gpt-4o" }
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
});
