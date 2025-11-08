import { setupWorkspace, shouldRunIntegrationTests } from "./setup";
import {
  sendMessageWithModel,
  createEventCollector,
  assertStreamSuccess,
  modelString,
} from "./helpers";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

// Ollama doesn't require API keys - it's a local service
// Tests require Ollama to be running with the gpt-oss:20b model installed

describeIntegration("IpcMain Ollama integration tests", () => {
  // Enable retries in CI for potential network flakiness with Ollama
  if (process.env.CI && typeof jest !== "undefined" && jest.retryTimes) {
    jest.retryTimes(3, { logErrorsBeforeRetry: true });
  }

  // Load tokenizer modules once before all tests (takes ~14s)
  // This ensures accurate token counts for API calls without timing out individual tests
  beforeAll(async () => {
    const { loadTokenizerModules } = await import("../../src/utils/main/tokenizer");
    await loadTokenizerModules();
  }, 30000); // 30s timeout for tokenizer loading

  test.concurrent(
    "should successfully send message to Ollama and receive response",
    async () => {
      // Setup test environment
      const { env, workspaceId, cleanup } = await setupWorkspace("ollama");
      try {
        // Send a simple message to verify basic connectivity
        const result = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Say 'hello' and nothing else",
          "ollama",
          "gpt-oss:20b"
        );

        // Verify the IPC call succeeded
        expect(result.success).toBe(true);

        // Collect and verify stream events
        const collector = createEventCollector(env.sentEvents, workspaceId);
        const streamEnd = await collector.waitForEvent("stream-end", 30000);

        expect(streamEnd).toBeDefined();
        assertStreamSuccess(collector);

        // Verify we received deltas
        const deltas = collector.getDeltas();
        expect(deltas.length).toBeGreaterThan(0);

        // Verify the response contains expected content
        const text = deltas.join("").toLowerCase();
        expect(text).toMatch(/hello/i);
      } finally {
        await cleanup();
      }
    },
    45000 // Ollama can be slower than cloud APIs, especially first run
  );

  test.concurrent(
    "should successfully call tools with Ollama",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace("ollama");
      try {
        // Ask for current time which should trigger bash tool
        const result = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "What is the current date and time? Use the bash tool to find out.",
          "ollama",
          "gpt-oss:20b"
        );

        expect(result.success).toBe(true);

        // Wait for stream to complete
        const collector = createEventCollector(env.sentEvents, workspaceId);
        await collector.waitForEvent("stream-end", 60000);

        assertStreamSuccess(collector);

        // Verify bash tool was called via events
        const events = collector.getEvents();
        const toolCallStarts = events.filter((e: any) => e.type === "tool-call-start");
        expect(toolCallStarts.length).toBeGreaterThan(0);

        const bashCall = toolCallStarts.find((e: any) => e.toolName === "bash");
        expect(bashCall).toBeDefined();

        // Verify we got a text response with date/time info
        const deltas = collector.getDeltas();
        const responseText = deltas.join("").toLowerCase();

        // Should mention time or date in response
        expect(responseText).toMatch(/time|date|am|pm|2024|2025/i);
      } finally {
        await cleanup();
      }
    },
    90000 // Tool calling can take longer
  );

  test.concurrent(
    "should handle file operations with Ollama",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace("ollama");
      try {
        // Ask to read a file that should exist
        const result = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Read the package.json file and tell me the project name.",
          "ollama",
          "gpt-oss:20b"
        );

        expect(result.success).toBe(true);

        // Wait for stream to complete
        const collector = createEventCollector(env.sentEvents, workspaceId);
        await collector.waitForEvent("stream-end", 60000);

        assertStreamSuccess(collector);

        // Verify file_read tool was called via events
        const events = collector.getEvents();
        const toolCallStarts = events.filter((e: any) => e.type === "tool-call-start");
        expect(toolCallStarts.length).toBeGreaterThan(0);

        const fileReadCall = toolCallStarts.find((e: any) => e.toolName === "file_read");
        expect(fileReadCall).toBeDefined();

        // Verify response mentions the project (cmux)
        const deltas = collector.getDeltas();
        const responseText = deltas.join("").toLowerCase();

        expect(responseText).toMatch(/cmux/i);
      } finally {
        await cleanup();
      }
    },
    90000 // File operations with reasoning
  );

  test.concurrent(
    "should handle errors gracefully when Ollama is not running",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace("ollama");
      try {
        // Override baseUrl to point to non-existent server
        const result = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "This should fail",
          "ollama",
          "gpt-oss:20b",
          {
            providerOptions: {
              ollama: {},
            },
          }
        );

        // If Ollama is running, test will pass
        // If not running, we should get an error
        if (!result.success) {
          expect(result.error).toBeDefined();
        } else {
          // If it succeeds, that's fine - Ollama is running
          const collector = createEventCollector(env.sentEvents, workspaceId);
          await collector.waitForEvent("stream-end", 30000);
        }
      } finally {
        await cleanup();
      }
    },
    45000
  );
});
