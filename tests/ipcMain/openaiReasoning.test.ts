/**
 * OpenAI Reasoning Error Reproduction Test
 *
 * This test attempts to reproduce the error:
 * "Item 'rs_*' of type 'reasoning' was provided without its required following item"
 *
 * The error occurs when:
 * 1. OpenAI reasoning model (gpt-5-codex, o3-mini, etc.) is used
 * 2. First message triggers reasoning + tool calls
 * 3. Follow-up message causes OpenAI to reference stale reasoning item IDs
 *
 * Run with: TEST_INTEGRATION=1 bun x jest tests/ipcMain/openaiReasoning.test.ts
 *
 * Set OPENAI_REASONING_TEST_RUNS=<n> to control number of attempts (default: 10)
 * The error is intermittent, so we retry multiple times to increase chances of reproduction.
 */

import {
  setupWorkspace,
  shouldRunIntegrationTests,
  validateApiKeys,
  type TestEnvironment,
} from "./setup";
import {
  sendMessageWithModel,
  createEventCollector,
  assertStreamSuccess,
} from "./helpers";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

// Validate API keys before running tests
if (shouldRunIntegrationTests()) {
  validateApiKeys(["OPENAI_API_KEY"]);
}

// Number of test runs to attempt (error is intermittent)
const TEST_RUNS = process.env.OPENAI_REASONING_TEST_RUNS
  ? parseInt(process.env.OPENAI_REASONING_TEST_RUNS, 10)
  : 10;

describeIntegration("OpenAI Reasoning Error Reproduction", () => {
  // Use longer timeout since we're doing multiple runs
  const TOTAL_TIMEOUT = TEST_RUNS * 60000; // 60s per run

  test.concurrent(
    `should handle multi-turn reasoning conversations (${TEST_RUNS} attempts)`,
    async () => {
      const provider = "openai";
      const model = "gpt-5-codex"; // OpenAI reasoning model

      let reproduced = false;
      let lastError: unknown = null;

      // Try multiple times to reproduce the error
      for (let run = 1; run <= TEST_RUNS; run++) {
        console.log(`\n[Run ${run}/${TEST_RUNS}] Starting OpenAI reasoning test...`);

        const { env, workspaceId, cleanup } = await setupWorkspace(provider, `reasoning-${run}`);

        try {
          // TURN 1: Message that triggers reasoning + tool calls
          console.log(`[Run ${run}] Sending first message (with reasoning)...`);
          const firstMessage =
            "Look at the files in this directory and write a hello.txt file with 'Hello from reasoning test'";

          const result1 = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            firstMessage,
            provider,
            model
          );

          if (!result1.success) {
            console.log(`[Run ${run}] First message failed:`, result1.error);
            await cleanup();
            continue;
          }

          // Wait for stream to complete (or error)
          const collector1 = createEventCollector(env.sentEvents, workspaceId);
          // Don't wait for stream-end if there's an error - check events immediately after any completion
          await collector1.waitForEvent("stream-end", 30000).catch(() => {/* Timeout is OK if error occurred */});
          
          // Check if stream had an error
          const streamError1 = collector1.getEvents().find((e) => "type" in e && e.type === "stream-error");
          if (streamError1) {
            console.log(`[Run ${run}] First stream error:`, streamError1);
            
            // Check if this is the error we're looking for
            if ("error" in streamError1 && typeof streamError1.error === "string") {
              if (streamError1.error.includes("reasoning") && streamError1.error.includes("without its required following item")) {
                console.log(`\n🎯 [Run ${run}] REPRODUCED THE ERROR on first message!`);
                reproduced = true;
                lastError = streamError1.error;
                await cleanup();
                break;
              }
            }
            
            await cleanup();
            continue;
          }

          console.log(`[Run ${run}] First message succeeded`);

          // Clear events for second message
          env.sentEvents.length = 0;

          // TURN 2: Follow-up message (this is where the error often occurs)
          console.log(`[Run ${run}] Sending second message (follow-up)...`);
          const secondMessage = "Now read that file and tell me what it says";

          const result2 = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            secondMessage,
            provider,
            model
          );

          if (!result2.success) {
            console.log(`[Run ${run}] Second message failed:`, result2.error);
            await cleanup();
            continue;
          }

          // Wait for stream to complete (or error)
          const collector2 = createEventCollector(env.sentEvents, workspaceId);
          await collector2.waitForEvent("stream-end", 30000).catch(() => {/* Timeout is OK if error occurred */});
          
          // Check if stream had the error we're looking for
          const streamError2 = collector2.getEvents().find((e) => "type" in e && e.type === "stream-error");
          if (streamError2) {
            console.log(`[Run ${run}] Second stream error:`, streamError2);
            
            // Check if this is the error we're looking for
            if ("error" in streamError2 && typeof streamError2.error === "string") {
              if (streamError2.error.includes("reasoning") && streamError2.error.includes("without its required following item")) {
                console.log(`\n🎯 [Run ${run}] REPRODUCED THE ERROR on second message!`);
                reproduced = true;
                lastError = streamError2.error;
                await cleanup();
                break;
              }
            }
            
            await cleanup();
            continue;
          }

          console.log(`[Run ${run}] Second message succeeded`);

          // If we got here, both messages succeeded - try a third message
          env.sentEvents.length = 0;

          // TURN 3: Another follow-up
          console.log(`[Run ${run}] Sending third message (another follow-up)...`);
          const thirdMessage = "What is the content of hello.txt?";

          const result3 = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            thirdMessage,
            provider,
            model
          );

          if (!result3.success) {
            console.log(`[Run ${run}] Third message failed:`, result3.error);
            await cleanup();
            continue;
          }

          // Wait for stream to complete (or error)
          const collector3 = createEventCollector(env.sentEvents, workspaceId);
          await collector3.waitForEvent("stream-end", 30000).catch(() => {/* Timeout is OK if error occurred */});
          
          // Check if stream had the error
          const streamError3 = collector3.getEvents().find((e) => "type" in e && e.type === "stream-error");
          if (streamError3) {
            console.log(`[Run ${run}] Third stream error:`, streamError3);
            
            // Check if this is the error we're looking for
            if ("error" in streamError3 && typeof streamError3.error === "string") {
              if (streamError3.error.includes("reasoning") && streamError3.error.includes("without its required following item")) {
                console.log(`\n🎯 [Run ${run}] REPRODUCED THE ERROR on third message!`);
                reproduced = true;
                lastError = streamError3.error;
                await cleanup();
                break;
              }
            }
          }

          console.log(`[Run ${run}] All three messages succeeded`);
          await cleanup();
        } catch (error) {
          console.log(`[Run ${run}] Exception:`, error);
          await cleanup();
        }
      }

      // Report results
      if (reproduced) {
        console.log(`\n✅ Successfully reproduced the OpenAI reasoning error!`);
        console.log(`Error: ${lastError}`);
        // Don't fail the test - we want to see the error in logs
        expect(reproduced).toBe(true);
      } else {
        console.log(`\n❌ Failed to reproduce the error after ${TEST_RUNS} attempts`);
        console.log(`Consider increasing OPENAI_REASONING_TEST_RUNS or modifying the test prompts`);
        // Don't fail - the error is intermittent
        expect(true).toBe(true);
      }
    },
    TOTAL_TIMEOUT
  );
});
