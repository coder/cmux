import { describe, test } from "bun:test";
import { ExtensionManager } from "./extensionManager";
import type { WorkspaceMetadata } from "@/types/workspace";
import type { RuntimeConfig } from "@/types/runtime";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

/**
 * Create a fresh test context with isolated temp directory and manager instance
 */
async function createTestContext() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ext-mgr-test-"));
  const projectPath = path.join(tempDir, "project");
  await fs.mkdir(projectPath, { recursive: true });

  const workspaceMetadata: WorkspaceMetadata = {
    id: "test-workspace",
    name: "test-branch",
    projectName: "test-project",
    projectPath,
  };

  const runtimeConfig: RuntimeConfig = {
    type: "local",
    srcBaseDir: path.join(tempDir, "src"),
  };

  const manager = new ExtensionManager();

  const cleanup = async () => {
    manager.shutdown();
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  };

  return { manager, tempDir, projectPath, workspaceMetadata, runtimeConfig, cleanup };
}

describe("ExtensionManager", () => {

  test.concurrent("initializeGlobal should do nothing when no extensions found", async () => {
    const { manager, cleanup } = await createTestContext();
    try {
      // No extensions in the global directory
      await manager.initializeGlobal();

      // No extension host should be spawned - postToolUse should work without error
      await manager.postToolUse("test-workspace", {
        toolName: "bash",
        toolCallId: "test-call",
        args: {},
        result: {},
        workspaceId: "test-workspace",
        timestamp: Date.now(),
      });

      // If no error thrown, test passes
    } finally {
      await cleanup();
    }
  });

  test.concurrent("initializeGlobal should not spawn multiple hosts", async () => {
    const { manager, cleanup } = await createTestContext();
    try {
      // Note: This test is limited because ExtensionManager hardcodes ~/.cmux/ext
      // For now, we test the idempotency without actually loading extensions

      // Call initializeGlobal twice
      const promise1 = manager.initializeGlobal();
      const promise2 = manager.initializeGlobal();

      await Promise.all([promise1, promise2]);

      // Should work without errors (testing for no crash)
    } finally {
      await cleanup();
    }
  });

  test.concurrent(
    "registerWorkspace and unregisterWorkspace should work",
    async () => {
      const { manager, workspaceMetadata, runtimeConfig, cleanup } = await createTestContext();
      try {
        // Note: This test is limited because ExtensionManager hardcodes ~/.cmux/ext
        // For now, we test workspace registration without actually loading extensions

        // Initialize global host
        await manager.initializeGlobal();

        // Register workspace
        await manager.registerWorkspace("test-workspace", workspaceMetadata, runtimeConfig, "/tmp");

        // Unregister workspace
        await manager.unregisterWorkspace("test-workspace");

        // Should work without errors
      } finally {
        await cleanup();
      }
    },
    10000
  );

  test.concurrent("shutdown should clean up the global host", async () => {
    const { manager, cleanup } = await createTestContext();
    try {
      // Note: This test is limited because ExtensionManager hardcodes ~/.cmux/ext
      // For now, we test shutdown without actually loading extensions

      // Initialize global host
      await manager.initializeGlobal();

      // Shutdown
      manager.shutdown();

      // Should work without errors
    } finally {
      await cleanup();
    }
  });

  test.concurrent("postToolUse should do nothing when no host initialized", async () => {
    const { manager, cleanup } = await createTestContext();
    try {
      await manager.postToolUse("nonexistent-workspace", {
        toolName: "bash",
        toolCallId: "test-call",
        args: {},
        result: {},
        workspaceId: "nonexistent-workspace",
        timestamp: Date.now(),
      });

      // Should not throw
    } finally {
      await cleanup();
    }
  });
});
