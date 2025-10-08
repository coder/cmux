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
    "should successfully execute web_search tool call",
    async () => {
      // Setup test environment with OpenAI
      const { env, workspaceId, cleanup } = await setupWorkspace("openai");
      try {
        // Send a message that should trigger web search
        // Use a query that requires current information to encourage web search
        const result = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Search the web for current weather in San Francisco",
          "openai",
          "gpt-5-codex"
        );

        // Verify the IPC call succeeded
        expect(result.success).toBe(true);

        // Collect and verify stream events
        const collector = createEventCollector(env.sentEvents, workspaceId);

        // Wait for stream to start
        const streamStart = await collector.waitForEvent("stream-start", 10000);
        expect(streamStart).toBeDefined();

        // Wait for tool-call-start (indicates web_search is being executed)
        const toolCallStart = await collector.waitForEvent("tool-call-start", 15000);
        expect(toolCallStart).toBeDefined();

        // Verify it's a web_search tool call
        if (toolCallStart && "toolName" in toolCallStart) {
          expect(toolCallStart.toolName).toBe("web_search");
        }

        // Wait for stream to complete
        const streamEnd = await collector.waitForEvent("stream-end", 30000);
        expect(streamEnd).toBeDefined();

        // Verify no errors occurred
        assertStreamSuccess(collector);

        // Verify we received text deltas (the assistant's response)
        const deltas = collector.getDeltas();
        expect(deltas.length).toBeGreaterThan(0);

        // Collect all events and verify web_search was executed
        collector.collect();
        const events = collector.getEvents();

        const hasWebSearchCall = events.some(
          (e) =>
            "type" in e &&
            e.type === "tool-call-start" &&
            "toolName" in e &&
            e.toolName === "web_search"
        );
        expect(hasWebSearchCall).toBe(true);
      } finally {
        await cleanup();
      }
    },
    45000 // 45 second timeout - web search can take time
  );

  test.concurrent(
    "should handle multiple web_search calls in sequence",
    async () => {
      // Setup test environment with OpenAI
      const { env, workspaceId, cleanup } = await setupWorkspace("openai");
      try {
        // Send a message that might trigger multiple web searches
        const result = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Search for the latest news about TypeScript and then search for React updates",
          "openai",
          "gpt-5-codex"
        );

        // Verify the IPC call succeeded
        expect(result.success).toBe(true);

        // Collect and verify stream events
        const collector = createEventCollector(env.sentEvents, workspaceId);

        // Wait for stream to complete (may take longer with multiple searches)
        const streamEnd = await collector.waitForEvent("stream-end", 60000);
        expect(streamEnd).toBeDefined();

        // Verify no errors occurred
        assertStreamSuccess(collector);

        // Collect all events
        collector.collect();
        const events = collector.getEvents();

        // Count web_search tool calls
        const webSearchCalls = events.filter(
          (e) =>
            "type" in e &&
            e.type === "tool-call-start" &&
            "toolName" in e &&
            e.toolName === "web_search"
        );

        // Should have at least one web_search call
        // (Model may decide to combine searches or use multiple - either is valid)
        expect(webSearchCalls.length).toBeGreaterThan(0);
      } finally {
        await cleanup();
      }
    },
    75000 // 75 second timeout - multiple searches take time
  );

  test.concurrent(
    "should correctly handle reasoning with web_search",
    async () => {
      // Setup test environment with OpenAI
      const { env, workspaceId, cleanup } = await setupWorkspace("openai");
      try {
        // Send a message that should trigger reasoning + web search
        const result = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Find recent information about quantum computing breakthroughs",
          "openai",
          "gpt-5-codex"
        );

        // Verify the IPC call succeeded
        expect(result.success).toBe(true);

        // Collect and verify stream events
        const collector = createEventCollector(env.sentEvents, workspaceId);

        // Wait for stream to complete
        const streamEnd = await collector.waitForEvent("stream-end", 45000);
        expect(streamEnd).toBeDefined();

        // Verify no errors occurred (this is the key test - ensuring no reasoning-related errors)
        assertStreamSuccess(collector);

        // Collect all events
        collector.collect();
        const events = collector.getEvents();

        // Verify we got reasoning deltas (OpenAI o1/o3 models produce reasoning)
        const hasReasoning = events.some((e) => "type" in e && e.type === "reasoning-delta");

        // Verify we got web_search tool call
        const hasWebSearch = events.some(
          (e) =>
            "type" in e &&
            e.type === "tool-call-start" &&
            "toolName" in e &&
            e.toolName === "web_search"
        );

        // Both reasoning and web_search should be present (if model supports reasoning)
        // If reasoning is present, web_search should also work without errors
        if (hasReasoning) {
          expect(hasWebSearch).toBe(true);
        }
      } finally {
        await cleanup();
      }
    },
    60000 // 60 second timeout
  );
});
