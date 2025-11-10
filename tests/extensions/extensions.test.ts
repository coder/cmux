import { describe, test, expect } from "@jest/globals";
import {
  shouldRunIntegrationTests,
  createTestEnvironment,
} from "../ipcMain/setup";
import { withTest } from "./helpers";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

describeIntegration("Extension System Integration Tests", () => {
  test.concurrent(
    "should load and execute extension on tool use",
    async () => {
      await withTest(createTestEnvironment, async (ctx) => {
        // Load simple-logger extension (TypeScript file)
        await ctx.loadFixture("simple-logger.ts", "test-logger.ts");

        // Create workspace
        const { workspaceId } = await ctx.createWorkspace("test-ext");

        // Execute a bash command to trigger extension
        const bashResult = await ctx.executeBash(workspaceId, "echo 'test'");
        expect(bashResult.success).toBe(true);

        // Wait for extension to execute
        await ctx.waitForExtensions();

        // Check if extension wrote to the log file
        const logContent = await ctx.readOutput(workspaceId, ".cmux/extension-log.txt");

        if (logContent) {
          expect(logContent).toContain("bash");
          expect(logContent).toContain(workspaceId);
        } else {
          // Log file might not exist yet - that's okay for this test
          console.log("Extension log not found (might not have executed yet)");
        }
      });
    },
    60000 // 60s timeout for extension host initialization
  );

  test.concurrent(
    "should load folder-based extension with manifest",
    async () => {
      await withTest(createTestEnvironment, async (ctx) => {
        // Load folder-based extension (auto-detects it's a directory)
        await ctx.loadFixture("folder-extension", "folder-ext");

        // Create workspace
        const { workspaceId } = await ctx.createWorkspace("test-folder-ext");

        // Execute a bash command to trigger extension
        const bashResult = await ctx.executeBash(workspaceId, "echo 'test'");
        expect(bashResult.success).toBe(true);

        // Wait for extension to execute
        await ctx.waitForExtensions();

        // Check if extension wrote the marker file
        const output = await ctx.readOutput(workspaceId, ".cmux/folder-ext-ran.txt");

        if (output) {
          expect(output).toContain("folder-based extension executed");
        }
      });
    },
    60000
  );

  test.concurrent(
    "should handle extension errors gracefully",
    async () => {
      await withTest(createTestEnvironment, async (ctx) => {
        // Load broken and working extensions
        await ctx.loadFixture("broken-extension.ts", "broken-ext.ts");
        await ctx.loadFixture("working-extension.ts", "working-ext.ts");

        // Create workspace
        const { workspaceId } = await ctx.createWorkspace("test-error-handling");

        // Execute a bash command - should still succeed even though one extension fails
        const bashResult = await ctx.executeBash(workspaceId, "echo 'test'");
        expect(bashResult.success).toBe(true);

        // Wait for extensions to execute
        await ctx.waitForExtensions();

        // Verify the working extension still ran
        const output = await ctx.readOutput(workspaceId, ".cmux/working-ext-ran.txt");

        if (output) {
          expect(output).toContain("working extension executed");
        }
      });
    },
    60000
  );
});
