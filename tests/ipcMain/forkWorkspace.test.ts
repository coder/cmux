import {
  shouldRunIntegrationTests,
  createTestEnvironment,
  cleanupTestEnvironment,
} from "./setup";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";
import { createTempGitRepo, cleanupTempGitRepo } from "./helpers";
import { detectDefaultTrunkBranch } from "../../src/git";
import * as fs from "fs/promises";
import * as path from "path";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

describeIntegration("IpcMain fork workspace integration tests", () => {
  test.concurrent(
    "should fail to fork workspace with invalid name",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Create source workspace
        const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);
        const createResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_CREATE,
          tempGitRepo,
          "source-workspace",
          trunkBranch
        );
        expect(createResult.success).toBe(true);
        const sourceWorkspaceId = createResult.metadata.id;

        // Test various invalid names
        const invalidNames = [
          { name: "", expectedError: "empty" },
          { name: "Invalid-Name", expectedError: "lowercase" },
          { name: "name with spaces", expectedError: "lowercase" },
          { name: "name@special", expectedError: "lowercase" },
          { name: "a".repeat(65), expectedError: "64 characters" },
        ];

        for (const { name, expectedError } of invalidNames) {
          const forkResult = await env.mockIpcRenderer.invoke(
            IPC_CHANNELS.WORKSPACE_FORK,
            sourceWorkspaceId,
            name
          );
          expect(forkResult.success).toBe(false);
          expect(forkResult.error.toLowerCase()).toContain(expectedError.toLowerCase());
        }

        // Cleanup
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, sourceWorkspaceId);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    15000
  );

  test.concurrent(
    "should successfully fork workspace with valid name",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Create source workspace
        const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);
        const createResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_CREATE,
          tempGitRepo,
          "source-workspace",
          trunkBranch
        );
        expect(createResult.success).toBe(true);
        const sourceWorkspaceId = createResult.metadata.id;

        // Fork the workspace
        const forkResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_FORK,
          sourceWorkspaceId,
          "forked-workspace"
        );

        if (!forkResult.success) {
          console.error("Failed to fork workspace:", forkResult.error);
        }

        expect(forkResult.success).toBe(true);
        expect(forkResult.metadata.id).toBeDefined();
        expect(forkResult.metadata.workspacePath).toBeDefined();
        expect(forkResult.metadata.projectName).toBeDefined();
        expect(forkResult.projectPath).toBe(tempGitRepo);

        // Verify forked workspace is different from source
        expect(forkResult.metadata.id).not.toBe(sourceWorkspaceId);

        // Cleanup
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, sourceWorkspaceId);
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, forkResult.metadata.id);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    30000
  );

  test.concurrent(
    "should copy chat history when forking workspace",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Create source workspace
        const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);
        const createResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_CREATE,
          tempGitRepo,
          "source-with-history",
          trunkBranch
        );
        expect(createResult.success).toBe(true);
        const sourceWorkspaceId = createResult.metadata.id;

        // Create chat history file directly (bypassing API key requirement)
        const sourceSessionDir = path.join(env.config.sessionsDir, sourceWorkspaceId);
        await fs.mkdir(sourceSessionDir, { recursive: true });
        const sourceChatPath = path.join(sourceSessionDir, "chat.jsonl");
        const testMessage = {
          id: "test-message-1",
          role: "user",
          content: "Test message",
          metadata: { timestamp: Date.now() },
        };
        await fs.writeFile(sourceChatPath, JSON.stringify(testMessage) + "\n");

        // Verify source chat history exists
        const sourceChatExists = await fs
          .access(sourceChatPath)
          .then(() => true)
          .catch(() => false);
        expect(sourceChatExists).toBe(true);
        const sourceChat = await fs.readFile(sourceChatPath, "utf-8");
        const sourceLines = sourceChat.split("\n").filter((line) => line.trim());

        // Fork the workspace
        const forkResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_FORK,
          sourceWorkspaceId,
          "forked-with-history"
        );

        expect(forkResult.success).toBe(true);
        const forkedWorkspaceId = forkResult.metadata.id;

        // Verify forked workspace has copied chat history
        const forkedSessionDir = path.join(env.config.sessionsDir, forkedWorkspaceId);
        const forkedChatPath = path.join(forkedSessionDir, "chat.jsonl");
        const forkedChatExists = await fs
          .access(forkedChatPath)
          .then(() => true)
          .catch(() => false);
        expect(forkedChatExists).toBe(true);
        const forkedChat = await fs.readFile(forkedChatPath, "utf-8");
        const forkedLines = forkedChat.split("\n").filter((line) => line.trim());

        // Verify same number of messages
        expect(forkedLines.length).toBe(sourceLines.length);

        // Cleanup
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, sourceWorkspaceId);
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, forkedWorkspaceId);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    30000
  );

  test.concurrent(
    "should update config correctly when forking workspace",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Create source workspace
        const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);
        const createResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_CREATE,
          tempGitRepo,
          "source-config",
          trunkBranch
        );
        expect(createResult.success).toBe(true);
        const sourceWorkspaceId = createResult.metadata.id;

        // Fork the workspace
        const forkResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_FORK,
          sourceWorkspaceId,
          "forked-config"
        );

        expect(forkResult.success).toBe(true);

        // Verify config includes both workspaces
        const config = env.config.loadConfigOrDefault();
        const projectConfig = config.projects.get(tempGitRepo);
        expect(projectConfig).toBeDefined();
        expect(projectConfig!.workspaces.length).toBeGreaterThanOrEqual(2);

        // Verify both workspace paths are in config
        const workspacePaths = projectConfig!.workspaces.map((ws) => ws.path);
        expect(workspacePaths).toContain(createResult.metadata.workspacePath);
        expect(workspacePaths).toContain(forkResult.metadata.workspacePath);

        // Cleanup
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, sourceWorkspaceId);
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, forkResult.metadata.id);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    30000
  );

  test.concurrent(
    "should create independent git branch for forked workspace",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Create source workspace
        const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);
        const createResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_CREATE,
          tempGitRepo,
          "source-branch",
          trunkBranch
        );
        expect(createResult.success).toBe(true);
        const sourceWorkspaceId = createResult.metadata.id;

        // Fork the workspace
        const forkResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_FORK,
          sourceWorkspaceId,
          "forked-branch"
        );

        expect(forkResult.success).toBe(true);

        // Verify both workspaces exist and have different paths
        expect(forkResult.metadata.workspacePath).not.toBe(createResult.metadata.workspacePath);

        // Verify both workspace directories exist
        const sourceExists = await fs
          .access(createResult.metadata.workspacePath)
          .then(() => true)
          .catch(() => false);
        const forkedExists = await fs
          .access(forkResult.metadata.workspacePath)
          .then(() => true)
          .catch(() => false);

        expect(sourceExists).toBe(true);
        expect(forkedExists).toBe(true);

        // Cleanup
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, sourceWorkspaceId);
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, forkResult.metadata.id);
      } finally {
        await cleanupTestEnvironment(env);
        await cleanupTempGitRepo(tempGitRepo);
      }
    },
    30000
  );
});

