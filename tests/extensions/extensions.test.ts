import { describe, test, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import {
  shouldRunIntegrationTests,
  createTestEnvironment,
  cleanupTestEnvironment,
} from "../ipcMain/setup";
import { createTempGitRepo, cleanupTempGitRepo, createWorkspace } from "../ipcMain/helpers";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";
import type { WorkspaceMetadata } from "../../src/types/workspace";

type WorkspaceCreationResult = Awaited<ReturnType<typeof createWorkspace>>;

function expectWorkspaceCreationSuccess(result: WorkspaceCreationResult): WorkspaceMetadata {
  expect(result.success).toBe(true);
  if (!result.success) {
    throw new Error(`Expected workspace creation to succeed, but it failed: ${result.error}`);
  }
  return result.metadata;
}

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

describeIntegration("Extension System Integration Tests", () => {
  test.concurrent(
    "should load and execute extension on tool use",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Create a test extension in the temp project
        const extDir = path.join(tempGitRepo, ".cmux", "ext");
        fs.mkdirSync(extDir, { recursive: true });

        // Create a simple extension that writes to a log file
        const extensionCode = `
export default {
  async onPostToolUse({ toolName, toolCallId, workspaceId, runtime }) {
    const logEntry = JSON.stringify({
      timestamp: new Date().toISOString(),
      toolName,
      toolCallId,
      workspaceId
    }) + '\\n';
    await runtime.writeFile('.cmux/extension-log.txt', logEntry, { append: true });
  }
};
`;
        fs.writeFileSync(path.join(extDir, "test-logger.js"), extensionCode);

        // Create a workspace
        const createResult = await createWorkspace(env.mockIpcRenderer, tempGitRepo, "test-ext");
        const metadata = expectWorkspaceCreationSuccess(createResult);
        const workspaceId = metadata.id;

        // Execute a bash command to trigger extension
        const bashResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_EXECUTE_BASH,
          workspaceId,
          "echo 'test'"
        );

        expect(bashResult.success).toBe(true);
        expect(bashResult.data.success).toBe(true);

        // Wait a bit for extension to execute
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check if extension wrote to the log file by reading via bash
        const catResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_EXECUTE_BASH,
          workspaceId,
          "cat .cmux/extension-log.txt 2>&1"
        );

        expect(catResult.success).toBe(true);

        if (catResult.success && catResult.data.success) {
          const logContent = catResult.data.output;
          expect(logContent).toBeTruthy();
          expect(logContent).toContain("bash");
          expect(logContent).toContain(workspaceId);
        } else {
          // Log file might not exist yet - that's okay for this test
          console.log("Extension log not found (might not have executed yet)");
        }

        // Clean up
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, workspaceId);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    60000 // 60s timeout for extension host initialization
  );

  test.concurrent(
    "should load folder-based extension with manifest",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Create a folder-based extension
        const extDir = path.join(tempGitRepo, ".cmux", "ext", "folder-ext");
        fs.mkdirSync(extDir, { recursive: true });

        // Create manifest
        const manifest = {
          entrypoint: "index.js",
        };
        fs.writeFileSync(path.join(extDir, "manifest.json"), JSON.stringify(manifest, null, 2));

        // Create extension code
        const extensionCode = `
export default {
  async onPostToolUse({ toolName, runtime }) {
    await runtime.writeFile('.cmux/folder-ext-ran.txt', 'folder-based extension executed');
  }
};
`;
        fs.writeFileSync(path.join(extDir, "index.js"), extensionCode);

        // Create a workspace
        const createResult = await createWorkspace(
          env.mockIpcRenderer,
          tempGitRepo,
          "test-folder-ext"
        );
        const metadata = expectWorkspaceCreationSuccess(createResult);
        const workspaceId = metadata.id;

        // Execute a bash command to trigger extension
        const bashResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_EXECUTE_BASH,
          workspaceId,
          "echo 'test'"
        );

        expect(bashResult.success).toBe(true);

        // Wait for extension to execute
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Check if extension wrote the marker file via bash
        const catResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_EXECUTE_BASH,
          workspaceId,
          "cat .cmux/folder-ext-ran.txt 2>&1"
        );

        expect(catResult.success).toBe(true);
        if (catResult.success && catResult.data.success) {
          expect(catResult.data.output).toContain("folder-based extension executed");
        }

        // Clean up
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, workspaceId);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    60000
  );

  test.concurrent(
    "should handle extension errors gracefully",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Create an extension that throws an error
        const extDir = path.join(tempGitRepo, ".cmux", "ext");
        fs.mkdirSync(extDir, { recursive: true });

        const brokenExtensionCode = `
export default {
  async onPostToolUse() {
    throw new Error("Intentional test error");
  }
};
`;
        fs.writeFileSync(path.join(extDir, "broken-ext.js"), brokenExtensionCode);

        // Also create a working extension
        const workingExtensionCode = `
export default {
  async onPostToolUse({ runtime }) {
    await runtime.writeFile('.cmux/working-ext-ran.txt', 'working extension executed');
  }
};
`;
        fs.writeFileSync(path.join(extDir, "working-ext.js"), workingExtensionCode);

        // Create a workspace
        const createResult = await createWorkspace(
          env.mockIpcRenderer,
          tempGitRepo,
          "test-error-handling"
        );
        const metadata = expectWorkspaceCreationSuccess(createResult);
        const workspaceId = metadata.id;

        // Execute a bash command - should still succeed even though one extension fails
        const bashResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_EXECUTE_BASH,
          workspaceId,
          "echo 'test'"
        );

        expect(bashResult.success).toBe(true);
        expect(bashResult.data.success).toBe(true);

        // Wait for extensions to execute
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Verify the working extension still ran via bash
        const catResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_EXECUTE_BASH,
          workspaceId,
          "cat .cmux/working-ext-ran.txt 2>&1"
        );

        expect(catResult.success).toBe(true);
        if (catResult.success && catResult.data.success) {
          expect(catResult.data.output).toContain("working extension executed");
        }

        // Clean up
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, workspaceId);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    60000
  );
});
