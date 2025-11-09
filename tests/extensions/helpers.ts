import * as fs from "fs/promises";
import * as path from "path";
import type { IpcRenderer } from "electron";
import type { TestEnvironment } from "../ipcMain/setup";
import { cleanupTestEnvironment } from "../ipcMain/setup";
import { createTempGitRepo, cleanupTempGitRepo, createWorkspace } from "../ipcMain/helpers";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";
import type { WorkspaceMetadata } from "../../src/types/workspace";

/**
 * Context provided to extension test callback.
 * Includes helpers scoped to this test instance.
 */
export interface ExtensionTestContext {
  env: TestEnvironment;
  tempGitRepo: string;
  extDir: string;
  loadFixture: (fixtureName: string, destName: string) => Promise<void>;
  createWorkspace: (branchName: string) => Promise<WorkspaceWithExtensions>;
  executeBash: (workspaceId: string, command: string) => Promise<{ success: boolean; output?: string }>;
  waitForExtensions: (ms?: number) => Promise<void>;
  readOutput: (workspaceId: string, filePath: string) => Promise<string | undefined>;
}

/**
 * Result of creating a workspace with extensions.
 */
export interface WorkspaceWithExtensions {
  metadata: WorkspaceMetadata;
  workspaceId: string;
}

/**
 * Run a test with automatic setup and cleanup.
 * Handles try/finally pattern and tracks created workspaces for automatic cleanup.
 * 
 * @param createTestEnvironment - Factory function to create test environment
 * @param testFn - Test callback that receives the test context
 * 
 * @example
 * await withTest(createTestEnvironment, async (ctx) => {
 *   await ctx.loadFixture("simple-logger.ts", "test-logger.ts");
 *   const { workspaceId } = await ctx.createWorkspace("test-ext");
 *   const result = await ctx.executeBash(workspaceId, "echo 'test'");
 *   expect(result.success).toBe(true);
 * });
 */
export async function withTest(
  createTestEnvironment: () => Promise<TestEnvironment>,
  testFn: (ctx: ExtensionTestContext) => Promise<void>
): Promise<void> {
  const env = await createTestEnvironment();
  const tempGitRepo = await createTempGitRepo();
  const extDir = path.join(tempGitRepo, ".cmux", "ext");
  await fs.mkdir(extDir, { recursive: true });

  // Track created workspaces for automatic cleanup
  const createdWorkspaces: string[] = [];

  const ctx: ExtensionTestContext = {
    env,
    tempGitRepo,
    extDir,

    loadFixture: (fixtureName: string, destName: string) => {
      return loadFixture(fixtureName, destName, extDir);
    },

    createWorkspace: async (branchName: string) => {
      const result = await createWorkspaceWithExtensions(env.mockIpcRenderer, tempGitRepo, branchName);
      createdWorkspaces.push(result.workspaceId);
      return result;
    },

    executeBash: (workspaceId: string, command: string) => {
      return executeBash(env.mockIpcRenderer, workspaceId, command);
    },

    waitForExtensions: (ms?: number) => {
      return wait(ms);
    },

    readOutput: (workspaceId: string, filePath: string) => {
      return readOutput(env.mockIpcRenderer, workspaceId, filePath);
    },
  };

  try {
    await testFn(ctx);
  } finally {
    // Clean up all created workspaces
    for (const workspaceId of createdWorkspaces) {
      try {
        await cleanup(env.mockIpcRenderer, workspaceId);
      } catch (error) {
        // Ignore cleanup errors - environment cleanup will handle it
      }
    }

    // Clean up test environment
    await cleanupTempGitRepo(tempGitRepo);
    await cleanupTestEnvironment(env);
  }
}

/**
 * Load a fixture (file or folder) into the test extension directory.
 * Automatically detects whether the fixture is a file or directory.
 * 
 * @param fixtureName - Name of the fixture file or folder (e.g., "simple-logger.ts" or "folder-extension")
 * @param destName - Name to use in the extension directory (e.g., "test-logger.ts" or "folder-ext")
 * @param extDir - Extension directory path
 */
export async function loadFixture(
  fixtureName: string,
  destName: string,
  extDir: string
): Promise<void> {
  const fixtureDir = path.join(__dirname, "fixtures");
  const source = path.join(fixtureDir, fixtureName);
  const dest = path.join(extDir, destName);

  // Check if source is a file or directory
  const stat = await fs.stat(source);

  if (stat.isFile()) {
    // Copy single file
    await fs.copyFile(source, dest);
  } else if (stat.isDirectory()) {
    // Copy directory recursively
    await fs.mkdir(dest, { recursive: true });

    const files = await fs.readdir(source);
    for (const file of files) {
      const sourcePath = path.join(source, file);
      const destPath = path.join(dest, file);
      const fileStat = await fs.stat(sourcePath);

      if (fileStat.isFile()) {
        await fs.copyFile(sourcePath, destPath);
      }
    }
  }
}

/**
 * Create a workspace with extensions already loaded.
 */
async function createWorkspaceWithExtensions(
  mockIpcRenderer: IpcRenderer,
  projectPath: string,
  branchName: string
): Promise<WorkspaceWithExtensions> {
  const result = await createWorkspace(mockIpcRenderer, projectPath, branchName);
  
  if (!result.success) {
    throw new Error(`Failed to create workspace: ${result.error}`);
  }

  return {
    metadata: result.metadata,
    workspaceId: result.metadata.id,
  };
}

/**
 * Execute a bash command in a workspace and wait for it to complete.
 */
async function executeBash(
  mockIpcRenderer: IpcRenderer,
  workspaceId: string,
  command: string
): Promise<{ success: boolean; output?: string }> {
  const result = await mockIpcRenderer.invoke(
    IPC_CHANNELS.WORKSPACE_EXECUTE_BASH,
    workspaceId,
    command
  );

  if (!result.success) {
    return { success: false };
  }

  return {
    success: result.data.success,
    output: result.data.output,
  };
}

/**
 * Wait for extension execution (extensions run async after tool use).
 */
async function wait(ms = 1000): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Read a file from the workspace by executing cat via bash.
 */
async function readOutput(
  mockIpcRenderer: IpcRenderer,
  workspaceId: string,
  filePath: string
): Promise<string | undefined> {
  const result = await executeBash(mockIpcRenderer, workspaceId, `cat ${filePath} 2>&1`);

  if (result.success && result.output) {
    // Check if output indicates file not found
    if (result.output.includes("No such file or directory")) {
      return undefined;
    }
    return result.output;
  }

  return undefined;
}

/**
 * Clean up a workspace after test.
 */
async function cleanup(mockIpcRenderer: IpcRenderer, workspaceId: string): Promise<void> {
  await mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, workspaceId);
}
