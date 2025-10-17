import { shouldRunIntegrationTests, createTestEnvironment, cleanupTestEnvironment } from "./setup";
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
        expect(forkResult.metadata.projectPath).toBe(tempGitRepo);
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

        // Add chat history to source workspace
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

        // Fork the workspace
        const forkResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_FORK,
          sourceWorkspaceId,
          "forked-with-history"
        );
        expect(forkResult.success).toBe(true);

        // User expects: forked workspace has same chat history
        const forkedSessionDir = path.join(env.config.sessionsDir, forkResult.metadata.id);
        const forkedChatPath = path.join(forkedSessionDir, "chat.jsonl");
        const forkedChat = await fs.readFile(forkedChatPath, "utf-8");
        const forkedMessage = JSON.parse(forkedChat.trim());
        expect(forkedMessage.content).toBe("Test message");

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
    "should make forked workspace available for listing",
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

        // User expects: both workspaces appear in workspace list
        const workspaces = await env.mockIpcRenderer.invoke(IPC_CHANNELS.WORKSPACE_LIST);
        const workspaceIds = workspaces.map((w: { id: string }) => w.id);
        expect(workspaceIds).toContain(sourceWorkspaceId);
        expect(workspaceIds).toContain(forkResult.metadata.id);

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
    "should create independent working directories for source and forked workspace",
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

        // User expects: both workspaces can be accessed and have independent directories
        const sourceInfo = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_GET_INFO,
          sourceWorkspaceId
        );
        const forkedInfo = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_GET_INFO,
          forkResult.metadata.id
        );

        expect(sourceInfo.namedWorkspacePath).not.toBe(forkedInfo.namedWorkspacePath);

        // Both directories should exist
        await expect(fs.access(sourceInfo.namedWorkspacePath)).resolves.toBeUndefined();
        await expect(fs.access(forkedInfo.namedWorkspacePath)).resolves.toBeUndefined();

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
    "should preserve streaming response when forking during active stream",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Create source workspace with streaming response
        const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);
        const createResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_CREATE,
          tempGitRepo,
          "source-with-partial",
          trunkBranch
        );
        expect(createResult.success).toBe(true);
        const sourceWorkspaceId = createResult.metadata.id;

        // Simulate active streaming response
        const sourceSessionDir = path.join(env.config.sessionsDir, sourceWorkspaceId);
        await fs.mkdir(sourceSessionDir, { recursive: true });
        const partialPath = path.join(sourceSessionDir, "partial.json");
        const streamingContent = "Partial streaming response...";
        await fs.writeFile(
          partialPath,
          JSON.stringify({
            id: "streaming-message",
            role: "assistant",
            content: streamingContent,
            parts: [{ type: "text", text: streamingContent }],
            metadata: { partial: true, historySequence: 1, timestamp: Date.now() },
          })
        );

        // Fork while stream is active
        const forkResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_FORK,
          sourceWorkspaceId,
          "forked-with-partial"
        );
        expect(forkResult.success).toBe(true);

        // User expects: forked workspace preserves the streaming content
        const forkedSessionDir = path.join(env.config.sessionsDir, forkResult.metadata.id);
        const forkedPartialPath = path.join(forkedSessionDir, "partial.json");
        const forkedPartialContent = await fs.readFile(forkedPartialPath, "utf-8");
        const forkedPartialData = JSON.parse(forkedPartialContent);
        expect(forkedPartialData.content).toBe(streamingContent);

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
