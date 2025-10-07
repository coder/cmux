import { shouldRunIntegrationTests, createTestEnvironment, cleanupTestEnvironment } from "./setup";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";
import { createTempGitRepo, cleanupTempGitRepo } from "./helpers";
import { BASH_HARD_MAX_LINES } from "../../src/constants/toolLimits";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

describeIntegration("IpcMain executeBash integration tests", () => {
  test.concurrent(
    "should execute bash command in workspace context",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Create a workspace
        const createResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_CREATE,
          tempGitRepo,
          "test-bash"
        );
        expect(createResult.success).toBe(true);
        const workspaceId = createResult.metadata.id;

        // Execute a simple bash command (pwd should return workspace path)
        const pwdResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_EXECUTE_BASH,
          workspaceId,
          "pwd"
        );

        expect(pwdResult.success).toBe(true);
        expect(pwdResult.data.success).toBe(true);
        expect(pwdResult.data.output).toContain("test-bash");
        expect(pwdResult.data.exitCode).toBe(0);

        // Clean up
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, workspaceId);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    15000
  );

  test.concurrent(
    "should execute git status in workspace context",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Create a workspace
        const createResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_CREATE,
          tempGitRepo,
          "test-git-status"
        );
        expect(createResult.success).toBe(true);
        const workspaceId = createResult.metadata.id;

        // Execute git status
        const gitStatusResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_EXECUTE_BASH,
          workspaceId,
          "git status"
        );

        expect(gitStatusResult.success).toBe(true);
        expect(gitStatusResult.data.success).toBe(true);
        expect(gitStatusResult.data.output).toContain("On branch");
        expect(gitStatusResult.data.exitCode).toBe(0);

        // Clean up
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, workspaceId);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    15000
  );

  test.concurrent(
    "should handle command failure with exit code",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Create a workspace
        const createResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_CREATE,
          tempGitRepo,
          "test-failure"
        );
        expect(createResult.success).toBe(true);
        const workspaceId = createResult.metadata.id;

        // Execute a command that will fail
        const failResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_EXECUTE_BASH,
          workspaceId,
          "exit 42"
        );

        expect(failResult.success).toBe(true);
        expect(failResult.data.success).toBe(false);
        expect(failResult.data.exitCode).toBe(42);
        expect(failResult.data.error).toContain("exited with code 42");

        // Clean up
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, workspaceId);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    15000
  );

  test.concurrent(
    "should respect timeout option",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Create a workspace
        const createResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_CREATE,
          tempGitRepo,
          "test-timeout"
        );
        expect(createResult.success).toBe(true);
        const workspaceId = createResult.metadata.id;

        // Execute a command that takes longer than the timeout
        const timeoutResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_EXECUTE_BASH,
          workspaceId,
          "sleep 10",
          { timeout_secs: 1 }
        );

        expect(timeoutResult.success).toBe(true);
        expect(timeoutResult.data.success).toBe(false);
        expect(timeoutResult.data.error).toContain("timed out");

        // Clean up
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, workspaceId);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    15000
  );

  test.concurrent(
    "should respect max_lines option",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Create a workspace
        const createResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_CREATE,
          tempGitRepo,
          "test-maxlines"
        );
        expect(createResult.success).toBe(true);
        const workspaceId = createResult.metadata.id;

        // Execute a command that produces many lines
        const maxLinesResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_EXECUTE_BASH,
          workspaceId,
          "for i in {1..100}; do echo line$i; done",
          { max_lines: 10 }
        );

        expect(maxLinesResult.success).toBe(true);
        expect(maxLinesResult.data.success).toBe(true);
        expect(maxLinesResult.data.truncated).toBe(true);
        expect(maxLinesResult.data.output).toContain("[TRUNCATED]");

        // Clean up
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, workspaceId);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    15000
  );

  test.concurrent(
    "should clamp max_lines to the hard cap",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        const createResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_CREATE,
          tempGitRepo,
          "test-maxlines-hardcap"
        );
        expect(createResult.success).toBe(true);
        const workspaceId = createResult.metadata.id;

        const oversizedResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_EXECUTE_BASH,
          workspaceId,
          "for i in {1..1100}; do echo line$i; done",
          { max_lines: BASH_HARD_MAX_LINES * 5 }
        );

        expect(oversizedResult.success).toBe(true);
        expect(oversizedResult.data.success).toBe(true);
        expect(oversizedResult.data.truncated).toBe(true);
        const lines = oversizedResult.data.output.split("\n");
        expect(lines).toHaveLength(BASH_HARD_MAX_LINES);
        expect(oversizedResult.data.output).toContain("[TRUNCATED]");

        await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, workspaceId);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    15000
  );

  test.concurrent(
    "should fail gracefully with invalid workspace ID",
    async () => {
      const env = await createTestEnvironment();

      try {
        // Execute bash command with non-existent workspace ID
        const result = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_EXECUTE_BASH,
          "nonexistent-workspace",
          "echo test"
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain("Failed to get workspace metadata");
      } finally {
        await cleanupTestEnvironment(env);
      }
    },
    15000
  );
});
