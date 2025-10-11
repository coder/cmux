import * as fs from "fs";
import {
  setupWorkspace,
  shouldRunIntegrationTests,
  validateApiKeys,
} from "./setup";
import {
  sendMessageWithModel,
  createEventCollector,
  assertStreamSuccess,
  waitFor,
} from "./helpers";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

// Validate API keys before running tests
if (shouldRunIntegrationTests()) {
  validateApiKeys(["ANTHROPIC_API_KEY"]);
}

describeIntegration("Temp directory cleanup integration tests", () => {
  test.concurrent(
    "agent can read overflow file during stream but not after cleanup",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace("anthropic", "temp-cleanup");
      let overflowFilePath: string | null = null;

      try {
        const collector = createEventCollector(env.sentEvents, workspaceId);

        // Send message that creates bash overflow (400 lines exceeds 300 hard cap)
        const firstMessage = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Run this command and tell me the path to the overflow file: for i in {1..400}; do echo line$i; done",
          "anthropic",
          "claude-sonnet-4-5"
        );
        
        // Wait for stream to complete
        await collector.waitForEvent("stream-end", 30000);
        assertStreamSuccess(collector);

        // Extract overflow file path from the response (look for bash tool output)
        const allEvents = collector.getEvents();
        let fullText = "";
        for (const e of allEvents) {
          if ("type" in e && e.type === "stream-delta" && "delta" in e) {
            const delta = e.delta as unknown;
            if (delta && typeof delta === "object" && "type" in delta && delta.type === "text-delta" && "text" in delta) {
              fullText += (delta as { text: string }).text;
            }
          }
        }

        // Find the file path in the output (format: saved to /path/to/file.txt)
        const pathMatch = fullText.match(/saved to (\/[^\s]+bash-[a-f0-9]{8}\.txt)/);
        expect(pathMatch).toBeTruthy();
        if (!pathMatch) {
          throw new Error(`Could not extract overflow file path from response. Text: ${fullText.substring(0, 500)}`);
        }
        overflowFilePath = pathMatch[1];

        // Verify file exists during the stream (after first message)
        expect(fs.existsSync(overflowFilePath)).toBe(true);
        const fileContent = fs.readFileSync(overflowFilePath, "utf-8");
        expect(fileContent).toContain("line1");
        expect(fileContent).toContain("line400");

        // Now send another message to try reading the file
        // This starts a NEW stream, which should trigger cleanup of the first stream's temp dir
        env.sentEvents.length = 0; // Clear previous events
        const secondCollector = createEventCollector(env.sentEvents, workspaceId);
        
        const secondMessage = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          `Read the first 5 lines of this file: ${overflowFilePath}`,
          "anthropic",
          "claude-sonnet-4-5"
        );
        
        await secondCollector.waitForEvent("stream-end", 30000);
        assertStreamSuccess(secondCollector);

        // Extract text from second response
        const secondEvents = secondCollector.getEvents();
        let secondText = "";
        for (const e of secondEvents) {
          if ("type" in e && e.type === "stream-delta" && "delta" in e) {
            const delta = e.delta as unknown;
            if (delta && typeof delta === "object" && "type" in delta && delta.type === "text-delta" && "text" in delta) {
              secondText += (delta as { text: string }).text;
            }
          }
        }
        
        // Agent should have successfully read the file (it existed when the stream started)
        expect(secondText).toContain("line1");

        // IMPORTANT: The second message started a NEW stream, which should have cleaned up
        // the first stream's temp dir. Wait for cleanup to complete.
        await waitFor(() => !fs.existsSync(overflowFilePath!), 2000);

        // Verify file is now gone (cleaned up with the old stream's temp dir)
        expect(fs.existsSync(overflowFilePath)).toBe(false);

        // Verify the temp directory itself is gone
        const tempDirPath = overflowFilePath.substring(0, overflowFilePath.lastIndexOf("/"));
        expect(fs.existsSync(tempDirPath)).toBe(false);
      } finally {
        // Cleanup: try to remove overflow file if it still exists
        if (overflowFilePath && fs.existsSync(overflowFilePath)) {
          const tempDirPath = overflowFilePath.substring(0, overflowFilePath.lastIndexOf("/"));
          try {
            fs.rmSync(tempDirPath, { recursive: true, force: true });
          } catch (e) {
            console.error("Failed to cleanup temp dir:", e);
          }
        }

        await cleanup();
      }
    },
    60000 // Longer timeout for multiple API calls
  );
});
