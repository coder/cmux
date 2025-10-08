import {
  setupWorkspace,
  shouldRunIntegrationTests,
  validateApiKeys,
  type TestEnvironment,
} from "./setup";
import { sendMessageWithModel, createEventCollector, assertStreamSuccess } from "./helpers";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

// Validate API keys before running tests
if (shouldRunIntegrationTests()) {
  validateApiKeys(["OPENAI_API_KEY"]);
}

describeIntegration("OpenAI web_search integration tests", () => {
  // Enable retries in CI for flaky API tests
  if (process.env.CI && typeof jest !== "undefined" && jest.retryTimes) {
    jest.retryTimes(3, { logErrorsBeforeRetry: true });
  }

  test.concurrent(
    "should successfully execute web_search without errors",
    async () => {
      // Setup test environment with OpenAI
      const { env, workspaceId, cleanup } = await setupWorkspace("openai");
      try {
        // Send a simple message requesting web search
        // Keep it simple to avoid model getting stuck in loops
        const result = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Use web_search to find what year TypeScript was first released. Answer with just the year.",
          "openai",
          "gpt-5-codex"
        );

        // Verify the IPC call succeeded
        expect(result.success).toBe(true);

        // Collect and verify stream events
        const collector = createEventCollector(env.sentEvents, workspaceId);

        // Wait for stream to complete
        const streamEnd = await collector.waitForEvent("stream-end", 60000);
        expect(streamEnd).toBeDefined();

        // Verify no errors occurred (this is the key test - ensuring no reasoning itemId errors)
        assertStreamSuccess(collector);

        // Collect all events and verify web_search was called
        collector.collect();
        const events = collector.getEvents();

        const hasWebSearchCall = events.some(
          (e) =>
            "type" in e &&
            e.type === "tool-call-start" &&
            "toolName" in e &&
            e.toolName === "web_search"
        );

        // Verify web_search was actually called
        expect(hasWebSearchCall).toBe(true);

        // Verify we received text deltas (the assistant's response)
        const deltas = collector.getDeltas();
        expect(deltas.length).toBeGreaterThan(0);
      } finally {
        await cleanup();
      }
    },
    90000 // 90 second timeout - be generous with reasoning models
  );
});
