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
        const workspacePath = metadata.workspacePath;

        // Verify the worktree exists
        const worktreeExistsBefore = await fs
          .access(workspacePath)
          .then(() => true)
          .catch(() => false);
        expect(worktreeExistsBefore).toBe(true);

        // Remove the workspace
        const removeResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_REMOVE,
          metadata.id
        );
        expect(removeResult.success).toBe(true);

        // Verify the worktree no longer exists
        const worktreeRemoved = await waitForFileNotExists(workspacePath, 5000);
        expect(worktreeRemoved).toBe(true);

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
        const workspacePath = metadata.workspacePath;

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
    "should successfully remove workspace with submodule",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Add a real submodule (leftpad) to the main repo
        await addSubmodule(tempGitRepo);

        const branchName = generateBranchName("remove-submodule-test");

        // Create a workspace with the repo that has a submodule
        const createResult = await createWorkspace(env.mockIpcRenderer, tempGitRepo, branchName);
        expect(createResult.success).toBe(true);
        if (!createResult.success) {
          throw new Error("Failed to create workspace");
        }

        const { metadata } = createResult;
        const workspacePath = metadata.workspacePath;

        // Verify the worktree exists
        const worktreeExistsBefore = await fs
          .access(workspacePath)
          .then(() => true)
          .catch(() => false);
        expect(worktreeExistsBefore).toBe(true);

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

        // Make worktree "dirty" to prevent the rename optimization
        // This forces git worktree remove to be used, which will fail with submodules
        await fs.appendFile(`${workspacePath}/README.md`, "\\nmodified");
        const gitStatus = await execAsync("git status --short", { cwd: workspacePath });
        expect(gitStatus.stdout.trim()).toContain("M README.md");

        // Remove the workspace
        const removeResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_REMOVE,
          metadata.id
        );
        expect(removeResult.success).toBe(true);

        // Verify the worktree no longer exists
        const worktreeRemoved = await waitForFileNotExists(workspacePath, 5000);
        expect(worktreeRemoved).toBe(true);

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
    30000
  );
});
