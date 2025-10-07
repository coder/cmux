/**
 * OpenAI Reasoning Error Reproduction Test
 *
 * PROBLEM:
 * OpenAI reasoning models (gpt-5-codex, o3-mini, etc.) intermittently return this error:
 *   "Item 'rs_*' of type 'reasoning' was provided without its required following item"
 *
 * This occurs in multi-turn conversations, especially when:
 * - Previous responses contained reasoning parts
 * - Tool calls are involved
 * - The `previous_response_id` parameter is used
 *
 * ⚠️  DISABLED BY DEFAULT
 * This test is ONLY for reproducing a specific bug. It makes real API calls and should NOT run in regular CI.
 *
 * Rationale for opt-in:
 * - Makes real API calls (costs money)
 * - Specifically for reproducing an intermittent error, not for validating functionality
 * - Should be run manually when investigating the bug
 *
 * USAGE:
 *   # Run with 10 attempts
 *   OPENAI_REASONING_TEST_RUNS=10 TEST_INTEGRATION=1 bun x jest tests/ipcMain/openaiReasoning.test.ts
 *
 *   # Run with more attempts to increase reproduction chance
 *   OPENAI_REASONING_TEST_RUNS=50 TEST_INTEGRATION=1 bun x jest tests/ipcMain/openaiReasoning.test.ts
 *
 *   # Without OPENAI_REASONING_TEST_RUNS, the test is skipped
 *   TEST_INTEGRATION=1 bun x jest tests/ipcMain/openaiReasoning.test.ts  # Skips
 *
 * HOW IT WORKS:
 * - Runs N attempts (configurable via OPENAI_REASONING_TEST_RUNS)
 * - For each attempt, creates a fresh workspace
 * - Uses ONLY read_file tool (safety - no file modifications)
 * - Sets reasoning effort to HIGH (maximize reasoning content)
 * - Sends 3 messages with aggressive prompts that trigger extensive reasoning
 * - Checks for the specific error in stream events
 * - Reports if the error was reproduced
 *
 * BASED ON cmux-docs-style ANALYSIS:
 * - Error more likely with extensive reasoning (3800+ reasoning parts observed)
 * - Error more likely with multiple tool calls in same response
 * - Pattern: user → assistant (reasoning + tools) → tool results → user (follow-up)
 *
 * WHY MULTIPLE ATTEMPTS?
 * The error is intermittent and depends on:
 * - OpenAI's internal state management
 * - Timing of requests
 * - Specific conversation patterns
 * - Model behavior variations
 *
 * NEXT STEPS (when error is reproduced):
 * 1. Examine debug dumps in ~/.cmux/debug_obj/<workspace>/
 * 2. Check conversation history in ~/.cmux/sessions/<workspace>/chat.jsonl
 * 3. Analyze the providerMetadata on reasoning parts
 * 4. Test potential fixes:
 *    - Clear providerMetadata from reasoning/tool parts
 *    - Omit previous_response_id when errors occur
 *    - Add retry logic for this specific error
 *
 * RELATED:
 * - GitHub Issue: vercel/ai#7099
 * - User report: Error occurs intermittently in production
 */

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

// Number of test runs to attempt (error is intermittent)
// Default to 0 (skip test) - this is an opt-in test for bug reproduction, not regular CI.
// Rationale:
// - Makes real API calls (costs money)
// - Specifically for reproducing an intermittent error, not for validating functionality
// - Should be run manually when investigating the bug
const TEST_RUNS = process.env.OPENAI_REASONING_TEST_RUNS
  ? parseInt(process.env.OPENAI_REASONING_TEST_RUNS, 10)
  : 0;

describeIntegration("OpenAI Reasoning Error Reproduction", () => {
  // Use longer timeout since we're doing multiple runs
  const TOTAL_TIMEOUT = TEST_RUNS * 60000; // 60s per run

  test.concurrent(
    `should handle multi-turn reasoning conversations (${TEST_RUNS} attempts)`,
    async () => {
      // Skip if TEST_RUNS is 0 (default)
      if (TEST_RUNS === 0) {
        console.log("⏭️  Skipping OpenAI reasoning test (set OPENAI_REASONING_TEST_RUNS to run)");
        expect(true).toBe(true);
        return;
      }

      const provider = "openai";
      const model = "gpt-5-codex"; // OpenAI reasoning model

      let reproduced = false;
      let lastError: unknown = null;

      // Tool policy: Only allow read_file (safety - don't modify files during testing)
      const toolPolicy = [
        { regex_match: "read_file", action: "enable" as const },
        { regex_match: ".*", action: "disable" as const }, // Disable all other tools
      ];

      // Prompts designed to trigger extensive reasoning + multiple file reads
      // Based on analysis of cmux-docs-style workspace which had 3842 reasoning parts
      const aggressivePrompts = [
        "Analyze all files in this directory. Read each file, identify the programming language, summarize the purpose, and create a comprehensive project overview document.",
        "Read all configuration files (package.json, tsconfig.json, etc), analyze the project setup, and create a detailed technical architecture document.",
        "Read all TypeScript files, identify patterns and common imports, analyze the code structure, and create a refactoring plan.",
      ];

      // Try multiple times to reproduce the error
      for (let run = 1; run <= TEST_RUNS; run++) {
        console.log(`\n[Run ${run}/${TEST_RUNS}] Starting OpenAI reasoning test...`);

        const { env, workspaceId, cleanup } = await setupWorkspace(provider, `reasoning-${run}`);

        try {
          // TURN 1: Message that triggers extensive reasoning + multiple file reads
          // Use different prompts to vary the test pattern
          const promptIndex = run % aggressivePrompts.length;
          const firstMessage = aggressivePrompts[promptIndex];
          console.log(`[Run ${run}] Sending first message (with reasoning)...`);
          console.log(`[Run ${run}] Prompt: ${firstMessage.substring(0, 80)}...`);

          const result1 = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            firstMessage,
            provider,
            model,
            {
              thinkingLevel: "high", // Max reasoning effort
              toolPolicy,
            }
          );

          if (!result1.success) {
            console.log(`[Run ${run}] First message failed:`, result1.error);
            await cleanup();
            continue;
          }

          // Wait for stream to complete (or error)
          const collector1 = createEventCollector(env.sentEvents, workspaceId);
          // Don't wait for stream-end if there's an error - check events immediately after any completion
          await collector1.waitForEvent("stream-end", 30000).catch(() => {
            /* Timeout is OK if error occurred */
          });

          // Check if stream had an error
          const streamError1 = collector1
            .getEvents()
            .find((e) => "type" in e && e.type === "stream-error");
          if (streamError1) {
            console.log(`[Run ${run}] First stream error:`, streamError1);

            // Check if this is the error we're looking for
            if ("error" in streamError1 && typeof streamError1.error === "string") {
              if (
                streamError1.error.includes("reasoning") &&
                streamError1.error.includes("without its required following item")
              ) {
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

          // TURN 2: Follow-up that references previous work (this is where the error often occurs)
          // Pattern from cmux-docs-style: user → assistant (reasoning + tools) → tool results → user
          console.log(`[Run ${run}] Sending second message (follow-up)...`);
          const secondMessage =
            "Based on your analysis, what are the key findings? Read any additional files you need to elaborate.";

          const result2 = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            secondMessage,
            provider,
            model,
            {
              thinkingLevel: "high",
              toolPolicy,
            }
          );

          if (!result2.success) {
            console.log(`[Run ${run}] Second message failed:`, result2.error);
            await cleanup();
            continue;
          }

          // Wait for stream to complete (or error)
          const collector2 = createEventCollector(env.sentEvents, workspaceId);
          await collector2.waitForEvent("stream-end", 30000).catch(() => {
            /* Timeout is OK if error occurred */
          });

          // Check if stream had the error we're looking for
          const streamError2 = collector2
            .getEvents()
            .find((e) => "type" in e && e.type === "stream-error");
          if (streamError2) {
            console.log(`[Run ${run}] Second stream error:`, streamError2);

            // Check if this is the error we're looking for
            if ("error" in streamError2 && typeof streamError2.error === "string") {
              if (
                streamError2.error.includes("reasoning") &&
                streamError2.error.includes("without its required following item")
              ) {
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

          // TURN 3: Another follow-up that might trigger more reasoning
          console.log(`[Run ${run}] Sending third message (another follow-up)...`);
          const thirdMessage =
            "Summarize the most important insights from your analysis. What files should I focus on?";

          const result3 = await sendMessageWithModel(
            env.mockIpcRenderer,
            workspaceId,
            thirdMessage,
            provider,
            model,
            {
              thinkingLevel: "high",
              toolPolicy,
            }
          );

          if (!result3.success) {
            console.log(`[Run ${run}] Third message failed:`, result3.error);
            await cleanup();
            continue;
          }

          // Wait for stream to complete (or error)
          const collector3 = createEventCollector(env.sentEvents, workspaceId);
          await collector3.waitForEvent("stream-end", 30000).catch(() => {
            /* Timeout is OK if error occurred */
          });

          // Check if stream had the error
          const streamError3 = collector3
            .getEvents()
            .find((e) => "type" in e && e.type === "stream-error");
          if (streamError3) {
            console.log(`[Run ${run}] Third stream error:`, streamError3);

            // Check if this is the error we're looking for
            if ("error" in streamError3 && typeof streamError3.error === "string") {
              if (
                streamError3.error.includes("reasoning") &&
                streamError3.error.includes("without its required following item")
              ) {
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
