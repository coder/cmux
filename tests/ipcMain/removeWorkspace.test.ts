/**
 * Integration tests for workspace deletion across Local and SSH runtimes
 *
 * Tests WORKSPACE_REMOVE IPC handler with both LocalRuntime (git worktrees)
 * and SSHRuntime (plain directories), including force flag and submodule handling.
 */

import * as fs from "fs/promises";
import * as path from "path";
import {
  createTestEnvironment,
  cleanupTestEnvironment,
  shouldRunIntegrationTests,
  preloadTestModules,
  type TestEnvironment,
} from "./setup";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";
import {
  createTempGitRepo,
  cleanupTempGitRepo,
  generateBranchName,
  addSubmodule,
  waitForFileNotExists,
  waitForInitComplete,
  createWorkspaceWithInit,
  TEST_TIMEOUT_LOCAL_MS,
  TEST_TIMEOUT_SSH_MS,
  INIT_HOOK_WAIT_MS,
  SSH_INIT_WAIT_MS,
} from "./helpers";
import {
  isDockerAvailable,
  startSSHServer,
  stopSSHServer,
  type SSHServerConfig,
} from "../runtime/ssh-fixture";
import type { RuntimeConfig } from "../../src/types/runtime";
import { execAsync } from "../../src/utils/disposableExec";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

// SSH server config (shared across all SSH tests)
let sshConfig: SSHServerConfig | undefined;

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Execute bash command in workspace context (works for both local and SSH)
 */
async function executeBash(
  env: TestEnvironment,
  workspaceId: string,
  command: string
): Promise<{ output: string; exitCode: number }> {
  const result = await env.mockIpcRenderer.invoke(
    IPC_CHANNELS.WORKSPACE_EXECUTE_BASH,
    workspaceId,
    command
  );

  if (!result.success) {
    throw new Error(`Bash execution failed: ${result.error}`);
  }

  // Result is wrapped in Ok(), so data is the BashToolResult
  const bashResult = result.data;
  return { output: bashResult.output, exitCode: bashResult.exitCode };
}

/**
 * Check if workspace directory exists (runtime-agnostic)
 * This verifies the workspace root directory exists
 */
async function workspaceExists(env: TestEnvironment, workspaceId: string): Promise<boolean> {
  try {
    // Try to execute a simple command in the workspace
    // If workspace doesn't exist, this will fail
    const result = await executeBash(env, workspaceId, `pwd`);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Make workspace dirty by modifying a tracked file (runtime-agnostic)
 */
async function makeWorkspaceDirty(env: TestEnvironment, workspaceId: string): Promise<void> {
  // Modify an existing tracked file (README.md exists in test repos)
  // This ensures git will detect uncommitted changes
  await executeBash(
    env,
    workspaceId,
    'echo "test modification to make workspace dirty" >> README.md'
  );
}

// ============================================================================
// Test Suite
// ============================================================================

describeIntegration("Workspace deletion integration tests", () => {
  beforeAll(async () => {
    await preloadTestModules();

    // Check if Docker is available (required for SSH tests)
    if (!(await isDockerAvailable())) {
      throw new Error(
        "Docker is required for SSH runtime tests. Please install Docker or skip tests by unsetting TEST_INTEGRATION."
      );
    }

    // Start SSH server (shared across all tests for speed)
    console.log("Starting SSH server container for deletion tests...");
    sshConfig = await startSSHServer();
    console.log(`SSH server ready on port ${sshConfig.port}`);
  }, 60000);

  afterAll(async () => {
    if (sshConfig) {
      console.log("Stopping SSH server container...");
      await stopSSHServer(sshConfig);
    }
  }, 30000);

  // Test matrix: Run tests for both local and SSH runtimes
  describe.each<{ type: "local" | "ssh" }>([{ type: "local" }, { type: "ssh" }])(
    "Runtime: $type",
    ({ type }) => {
      const TEST_TIMEOUT = type === "ssh" ? TEST_TIMEOUT_SSH_MS : TEST_TIMEOUT_LOCAL_MS;

      // Helper to build runtime config
      const getRuntimeConfig = (_branchName: string): RuntimeConfig | undefined => {
        if (type === "ssh" && sshConfig) {
          return {
            type: "ssh",
            host: `testuser@localhost`,
            srcBaseDir: sshConfig.workdir, // Base workdir, not including branch name
            identityFile: sshConfig.privateKeyPath,
            port: sshConfig.port,
          };
        }
        return undefined; // undefined = defaults to local
      };

      test.concurrent(
        "should successfully delete workspace",
        async () => {
          const env = await createTestEnvironment();
          const tempGitRepo = await createTempGitRepo();

          try {
            const branchName = generateBranchName("delete-test");
            const runtimeConfig = getRuntimeConfig(branchName);
            const { workspaceId, workspacePath } = await createWorkspaceWithInit(
              env,
              tempGitRepo,
              branchName,
              runtimeConfig,
              true, // waitForInit
              type === "ssh"
            );

            // Verify workspace exists (works for both local and SSH)
            const existsBefore = await workspaceExists(env, workspaceId);
            if (!existsBefore) {
              console.error(`Workspace ${workspaceId} does not exist after creation`);
              console.error(`workspacePath from metadata: ${workspacePath}`);
            }
            expect(existsBefore).toBe(true);

            // Delete the workspace
            const deleteResult = await env.mockIpcRenderer.invoke(
              IPC_CHANNELS.WORKSPACE_REMOVE,
              workspaceId
            );

            if (!deleteResult.success) {
              console.error("Delete failed:", deleteResult.error);
            }
            expect(deleteResult.success).toBe(true);

            // Verify workspace is no longer in config
            const config = env.config.loadConfigOrDefault();
            const project = config.projects.get(tempGitRepo);
            if (project) {
              const stillInConfig = project.workspaces.some((w) => w.id === workspaceId);
              expect(stillInConfig).toBe(false);
            }
          } finally {
            await cleanupTestEnvironment(env);
            await cleanupTempGitRepo(tempGitRepo);
          }
        },
        TEST_TIMEOUT
      );

      test.concurrent(
        "should handle deletion of non-existent workspace gracefully",
        async () => {
          const env = await createTestEnvironment();

          try {
            // Try to delete a workspace that doesn't exist
            const deleteResult = await env.mockIpcRenderer.invoke(
              IPC_CHANNELS.WORKSPACE_REMOVE,
              "non-existent-workspace-id"
            );

            // Should succeed (idempotent operation)
            expect(deleteResult.success).toBe(true);
          } finally {
            await cleanupTestEnvironment(env);
          }
        },
        TEST_TIMEOUT
      );

      test.concurrent(
        "should handle deletion when directory is already deleted",
        async () => {
          const env = await createTestEnvironment();
          const tempGitRepo = await createTempGitRepo();

          try {
            const branchName = generateBranchName("already-deleted");
            const runtimeConfig = getRuntimeConfig(branchName);
            const { workspaceId, workspacePath } = await createWorkspaceWithInit(
              env,
              tempGitRepo,
              branchName,
              runtimeConfig,
              true, // waitForInit
              type === "ssh"
            );

            // Manually delete the workspace directory using bash (works for both local and SSH)
            await executeBash(env, workspaceId, 'cd .. && rm -rf "$(basename "$PWD")"');

            // Verify it's gone (note: workspace is deleted, so we can't use executeBash on workspaceId anymore)
            // We'll verify via the delete operation and config check

            // Delete via IPC - should succeed and prune stale metadata
            const deleteResult = await env.mockIpcRenderer.invoke(
              IPC_CHANNELS.WORKSPACE_REMOVE,
              workspaceId
            );
            expect(deleteResult.success).toBe(true);

            // Verify workspace is no longer in config
            const config = env.config.loadConfigOrDefault();
            const project = config.projects.get(tempGitRepo);
            if (project) {
              const stillInConfig = project.workspaces.some((w) => w.id === workspaceId);
              expect(stillInConfig).toBe(false);
            }
          } finally {
            await cleanupTestEnvironment(env);
            await cleanupTempGitRepo(tempGitRepo);
          }
        },
        TEST_TIMEOUT
      );

      test.concurrent(
        "should fail to delete dirty workspace without force flag",
        async () => {
          const env = await createTestEnvironment();
          const tempGitRepo = await createTempGitRepo();

          try {
            const branchName = generateBranchName("delete-dirty");
            const runtimeConfig = getRuntimeConfig(branchName);
            const { workspaceId } = await createWorkspaceWithInit(
              env,
              tempGitRepo,
              branchName,
              runtimeConfig,
              true, // waitForInit
              type === "ssh"
            );

            // Make workspace dirty by modifying a file through bash
            await makeWorkspaceDirty(env, workspaceId);

            // Attempt to delete without force should fail
            const deleteResult = await env.mockIpcRenderer.invoke(
              IPC_CHANNELS.WORKSPACE_REMOVE,
              workspaceId
            );
            expect(deleteResult.success).toBe(false);
            expect(deleteResult.error).toMatch(
              /uncommitted changes|worktree contains modified|contains modified or untracked files/i
            );

            // Verify workspace still exists
            const stillExists = await workspaceExists(env, workspaceId);
            expect(stillExists).toBe(true);

            // Cleanup: force delete for cleanup
            await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, workspaceId, {
              force: true,
            });
          } finally {
            await cleanupTestEnvironment(env);
            await cleanupTempGitRepo(tempGitRepo);
          }
        },
        TEST_TIMEOUT
      );

      test.concurrent(
        "should delete dirty workspace with force flag",
        async () => {
          const env = await createTestEnvironment();
          const tempGitRepo = await createTempGitRepo();

          try {
            const branchName = generateBranchName("delete-dirty-force");
            const runtimeConfig = getRuntimeConfig(branchName);
            const { workspaceId } = await createWorkspaceWithInit(
              env,
              tempGitRepo,
              branchName,
              runtimeConfig,
              true, // waitForInit
              type === "ssh"
            );

            // Make workspace dirty through bash
            await makeWorkspaceDirty(env, workspaceId);

            // Delete with force should succeed
            const deleteResult = await env.mockIpcRenderer.invoke(
              IPC_CHANNELS.WORKSPACE_REMOVE,
              workspaceId,
              { force: true }
            );
            expect(deleteResult.success).toBe(true);

            // Verify workspace is no longer in config
            const config = env.config.loadConfigOrDefault();
            const project = config.projects.get(tempGitRepo);
            if (project) {
              const stillInConfig = project.workspaces.some((w) => w.id === workspaceId);
              expect(stillInConfig).toBe(false);
            }
          } finally {
            await cleanupTestEnvironment(env);
            await cleanupTempGitRepo(tempGitRepo);
          }
        },
        TEST_TIMEOUT
      );

      // Submodule tests only apply to local runtime (SSH doesn't use git worktrees)
      if (type === "local") {
        test.concurrent(
          "should successfully delete clean workspace with submodule",
          async () => {
            const env = await createTestEnvironment();
            const tempGitRepo = await createTempGitRepo();

            try {
              // Add a real submodule to the main repo
              await addSubmodule(tempGitRepo);

              const branchName = generateBranchName("delete-submodule-clean");
              const { workspaceId, workspacePath } = await createWorkspaceWithInit(
                env,
                tempGitRepo,
                branchName,
                undefined,
                true, // waitForInit
                false // not SSH
              );

              // Initialize submodule in the worktree
              using initProc = execAsync(`cd "${workspacePath}" && git submodule update --init`);
              await initProc.result;

              // Verify submodule is initialized
              const submoduleExists = await fs
                .access(path.join(workspacePath, "vendor", "left-pad"))
                .then(() => true)
                .catch(() => false);
              expect(submoduleExists).toBe(true);

              // Worktree has submodule - need force flag to delete via rm -rf fallback
              const deleteResult = await env.mockIpcRenderer.invoke(
                IPC_CHANNELS.WORKSPACE_REMOVE,
                workspaceId,
                { force: true }
              );
              if (!deleteResult.success) {
                console.error("Delete with submodule failed:", deleteResult.error);
              }
              expect(deleteResult.success).toBe(true);

              // Verify workspace was deleted
              const removed = await waitForFileNotExists(workspacePath, 5000);
              expect(removed).toBe(true);
            } finally {
              await cleanupTestEnvironment(env);
              await cleanupTempGitRepo(tempGitRepo);
            }
          },
          30000
        );

        test.concurrent(
          "should fail to delete dirty workspace with submodule, succeed with force",
          async () => {
            const env = await createTestEnvironment();
            const tempGitRepo = await createTempGitRepo();

            try {
              // Add a real submodule to the main repo
              await addSubmodule(tempGitRepo);

              const branchName = generateBranchName("delete-submodule-dirty");
              const { workspaceId, workspacePath } = await createWorkspaceWithInit(
                env,
                tempGitRepo,
                branchName,
                undefined,
                true, // waitForInit
                false // not SSH
              );

              // Initialize submodule in the worktree
              using initProc = execAsync(`cd "${workspacePath}" && git submodule update --init`);
              await initProc.result;

              // Make worktree dirty
              await fs.appendFile(path.join(workspacePath, "README.md"), "\nmodified");

              // First attempt should fail (dirty worktree with submodules)
              const deleteResult = await env.mockIpcRenderer.invoke(
                IPC_CHANNELS.WORKSPACE_REMOVE,
                workspaceId
              );
              expect(deleteResult.success).toBe(false);
              expect(deleteResult.error).toMatch(/submodule/i);

              // Verify worktree still exists
              const stillExists = await fs
                .access(workspacePath)
                .then(() => true)
                .catch(() => false);
              expect(stillExists).toBe(true);

              // Retry with force should succeed
              const forceDeleteResult = await env.mockIpcRenderer.invoke(
                IPC_CHANNELS.WORKSPACE_REMOVE,
                workspaceId,
                { force: true }
              );
              expect(forceDeleteResult.success).toBe(true);

              // Verify workspace was deleted
              const removed = await waitForFileNotExists(workspacePath, 5000);
              expect(removed).toBe(true);
            } finally {
              await cleanupTestEnvironment(env);
              await cleanupTempGitRepo(tempGitRepo);
            }
          },
          30000
        );
      }
    }
  );
});
