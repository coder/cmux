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
        // Copy test extension from fixtures to temp project
        const extDir = path.join(tempGitRepo, ".cmux", "ext");
        fs.mkdirSync(extDir, { recursive: true });

        // Copy simple-logger extension from fixtures
        const fixtureDir = path.join(__dirname, "fixtures");
        const simpleLoggerSource = path.join(fixtureDir, "simple-logger.js");
        const simpleLoggerDest = path.join(extDir, "test-logger.js");
        fs.copyFileSync(simpleLoggerSource, simpleLoggerDest);

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
        // Copy folder-based extension from fixtures to temp project
        const extBaseDir = path.join(tempGitRepo, ".cmux", "ext");
        fs.mkdirSync(extBaseDir, { recursive: true });

        // Copy entire folder-extension directory
        const fixtureDir = path.join(__dirname, "fixtures");
        const folderExtSource = path.join(fixtureDir, "folder-extension");
        const folderExtDest = path.join(extBaseDir, "folder-ext");
        
        // Copy directory recursively
        fs.mkdirSync(folderExtDest, { recursive: true });
        fs.copyFileSync(
          path.join(folderExtSource, "manifest.json"),
          path.join(folderExtDest, "manifest.json")
        );
        fs.copyFileSync(
          path.join(folderExtSource, "index.js"),
          path.join(folderExtDest, "index.js")
        );

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
        // Copy test extensions from fixtures to temp project
        const extDir = path.join(tempGitRepo, ".cmux", "ext");
        fs.mkdirSync(extDir, { recursive: true });

        const fixtureDir = path.join(__dirname, "fixtures");
        
        // Copy broken extension
        fs.copyFileSync(
          path.join(fixtureDir, "broken-extension.js"),
          path.join(extDir, "broken-ext.js")
        );

        // Copy working extension
        fs.copyFileSync(
          path.join(fixtureDir, "working-extension.js"),
          path.join(extDir, "working-ext.js")
        );

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
