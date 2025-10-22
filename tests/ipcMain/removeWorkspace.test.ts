import { shouldRunIntegrationTests, createTestEnvironment, cleanupTestEnvironment } from "./setup";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";
import {
  createTempGitRepo,
  cleanupTempGitRepo,
  createWorkspace,
  generateBranchName,
  waitForFileNotExists,
  addSubmodule,
} from "./helpers";
import * as fs from "fs/promises";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

describeIntegration("IpcMain remove workspace integration tests", () => {
  test.concurrent(
    "should successfully remove workspace and git worktree",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        const branchName = generateBranchName("remove-test");

        // Create a workspace
        const createResult = await createWorkspace(env.mockIpcRenderer, tempGitRepo, branchName);
        expect(createResult.success).toBe(true);
        if (!createResult.success) {
          throw new Error("Failed to create workspace");
        }

        const { metadata } = createResult;
        const workspacePath = metadata.namedWorkspacePath;

        // Verify the worktree exists
        const worktreeExistsBefore = await fs
          .access(workspacePath)
          .then(() => true)
          .catch(() => false);
        expect(worktreeExistsBefore).toBe(true);

        // Get the symlink path before removing
        const projectName = tempGitRepo.split("/").pop() || "unknown";
        const symlinkPath = `${env.config.srcDir}/${projectName}/${metadata.id}`;
        const symlinkExistsBefore = await fs
          .lstat(symlinkPath)
          .then(() => true)
          .catch(() => false);
        expect(symlinkExistsBefore).toBe(true);

        // Remove the workspace
        const removeResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_REMOVE,
          metadata.id
        );
        expect(removeResult.success).toBe(true);

        // Verify the worktree no longer exists
        const worktreeRemoved = await waitForFileNotExists(workspacePath, 5000);
        expect(worktreeRemoved).toBe(true);

        // Verify symlink is removed
        const symlinkExistsAfter = await fs
          .lstat(symlinkPath)
          .then(() => true)
          .catch(() => false);
        expect(symlinkExistsAfter).toBe(false);

        // Verify workspace is no longer in config
        const config = env.config.loadConfigOrDefault();
        const project = config.projects.get(tempGitRepo);
        if (project) {
          const workspaceStillInConfig = project.workspaces.some((w) => w.path === workspacePath);
          expect(workspaceStillInConfig).toBe(false);
        }
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    15000
  );

  test.concurrent(
    "should handle removal of non-existent workspace gracefully",
    async () => {
      const env = await createTestEnvironment();

      try {
        // Try to remove a workspace that doesn't exist
        const removeResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_REMOVE,
          "non-existent-workspace-id"
        );

        // Should succeed (idempotent operation)
        expect(removeResult.success).toBe(true);
      } finally {
        await cleanupTestEnvironment(env);
      }
    },
    15000
  );

  test.concurrent(
    "should handle removal when worktree directory is already deleted",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        const branchName = generateBranchName("remove-deleted");

        // Create a workspace
        const createResult = await createWorkspace(env.mockIpcRenderer, tempGitRepo, branchName);
        expect(createResult.success).toBe(true);
        if (!createResult.success) {
          throw new Error("Failed to create workspace");
        }

        const { metadata } = createResult;
        const workspacePath = metadata.namedWorkspacePath;

        // Manually delete the worktree directory (simulating external deletion)
        await fs.rm(workspacePath, { recursive: true, force: true });

        // Verify it's gone
        const worktreeExists = await fs
          .access(workspacePath)
          .then(() => true)
          .catch(() => false);
        expect(worktreeExists).toBe(false);

        // Remove the workspace via IPC - should succeed and prune stale worktree
        const removeResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_REMOVE,
          metadata.id
        );
        expect(removeResult.success).toBe(true);

        // Verify workspace is no longer in config
        const config = env.config.loadConfigOrDefault();
        const project = config.projects.get(tempGitRepo);
        if (project) {
          const workspaceStillInConfig = project.workspaces.some((w) => w.path === workspacePath);
          expect(workspaceStillInConfig).toBe(false);
        }
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    15000
  );

  test.concurrent(
    "should successfully remove clean workspace with submodule",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Add a real submodule (leftpad) to the main repo
        await addSubmodule(tempGitRepo);

        const branchName = generateBranchName("remove-submodule-clean");

        // Create a workspace with the repo that has a submodule
        const createResult = await createWorkspace(env.mockIpcRenderer, tempGitRepo, branchName);
        expect(createResult.success).toBe(true);
        if (!createResult.success) {
          throw new Error("Failed to create workspace");
        }

        const { metadata } = createResult;
        const workspacePath = metadata.namedWorkspacePath;

        // Initialize submodule in the worktree
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const execAsync = promisify(exec);
        await execAsync("git submodule update --init", { cwd: workspacePath });

        // Verify submodule is initialized
        const submodulePath = await fs
          .access(`${workspacePath}/vendor/left-pad`)
          .then(() => true)
          .catch(() => false);
        expect(submodulePath).toBe(true);

        // Worktree is clean (no uncommitted changes)
        // Should succeed via rename strategy (bypasses git worktree remove)
        const removeResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_REMOVE,
          metadata.id
        );
        expect(removeResult.success).toBe(true);

        // Verify the worktree no longer exists
        const worktreeRemoved = await waitForFileNotExists(workspacePath, 5000);
        expect(worktreeRemoved).toBe(true);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    30000
  );

  test.concurrent(
    "should fail to remove dirty workspace with submodule, succeed with force",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Add a real submodule (leftpad) to the main repo
        await addSubmodule(tempGitRepo);

        const branchName = generateBranchName("remove-submodule-dirty");

        // Create a workspace with the repo that has a submodule
        const createResult = await createWorkspace(env.mockIpcRenderer, tempGitRepo, branchName);
        expect(createResult.success).toBe(true);
        if (!createResult.success) {
          throw new Error("Failed to create workspace");
        }

        const { metadata } = createResult;
        const workspacePath = metadata.namedWorkspacePath;

        // Initialize submodule in the worktree
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const execAsync = promisify(exec);
        await execAsync("git submodule update --init", { cwd: workspacePath });

        // Make worktree "dirty" to prevent the rename optimization
        await fs.appendFile(`${workspacePath}/README.md`, "\\nmodified");

        // First attempt should fail (dirty worktree with submodules)
        const removeResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_REMOVE,
          metadata.id
        );
        expect(removeResult.success).toBe(false);
        expect(removeResult.error).toContain("submodule");

        // Verify worktree still exists
        const worktreeStillExists = await fs
          .access(workspacePath)
          .then(() => true)
          .catch(() => false);
        expect(worktreeStillExists).toBe(true);

        // Retry with force should succeed
        const forceRemoveResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_REMOVE,
          metadata.id,
          { force: true }
        );
        expect(forceRemoveResult.success).toBe(true);

        // Verify the worktree no longer exists
        const worktreeRemoved = await waitForFileNotExists(workspacePath, 5000);
        expect(worktreeRemoved).toBe(true);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    30000
  );
});
