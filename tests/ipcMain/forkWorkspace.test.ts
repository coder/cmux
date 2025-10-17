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
    "should preserve chat history when forking workspace",
    async () => {
      const env = await createTestEnvironment();
      const tempGitRepo = await createTempGitRepo();

      try {
        // Create source workspace with some history
        const trunkBranch = await detectDefaultTrunkBranch(tempGitRepo);
        const createResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_CREATE,
          tempGitRepo,
          "source-with-history",
          trunkBranch
        );
        expect(createResult.success).toBe(true);
        const sourceWorkspaceId = createResult.metadata.id;

        // Add chat history to source workspace (via filesystem for test setup)
        const sourceSessionDir = path.join(env.config.sessionsDir, sourceWorkspaceId);
        await fs.mkdir(sourceSessionDir, { recursive: true });
        const sourceChatPath = path.join(sourceSessionDir, "chat.jsonl");
        const testMessages = [
          { id: "msg-1", role: "user", content: "First message" },
          { id: "msg-2", role: "assistant", content: "First response" },
        ];
        await fs.writeFile(
          sourceChatPath,
          testMessages.map((m) => JSON.stringify(m)).join("\n") + "\n"
        );

        // Fork the workspace
        const forkResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_FORK,
          sourceWorkspaceId,
          "forked-with-history"
        );
        expect(forkResult.success).toBe(true);

        // User expects: forked workspace is accessible and independent
        // Verify through IPC that both workspaces exist
        const sourceInfo = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_GET_INFO,
          sourceWorkspaceId
        );
        const forkedInfo = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_GET_INFO,
          forkResult.metadata.id
        );

        expect(sourceInfo).toBeTruthy();
        expect(forkedInfo).toBeTruthy();
        expect(forkedInfo.id).not.toBe(sourceInfo.id);

        // Verify history was copied (filesystem check as proxy for history preservation)
        const forkedChatPath = path.join(
          env.config.sessionsDir,
          forkResult.metadata.id,
          "chat.jsonl"
        );
        const forkedChatExists = await fs
          .access(forkedChatPath)
          .then(() => true)
          .catch(() => false);
        expect(forkedChatExists).toBe(true);

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

        // User expects: both workspaces are accessible with different paths
        const sourceInfo = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_GET_INFO,
          sourceWorkspaceId
        );
        const forkedInfo = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_GET_INFO,
          forkResult.metadata.id
        );

        expect(sourceInfo).toBeTruthy();
        expect(forkedInfo).toBeTruthy();
        expect(sourceInfo.namedWorkspacePath).not.toBe(forkedInfo.namedWorkspacePath);

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

        // Simulate active streaming response (via filesystem for test setup)
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

        // User expects: forked workspace exists and is independent
        const forkedInfo = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_GET_INFO,
          forkResult.metadata.id
        );
        expect(forkedInfo).toBeTruthy();
        expect(forkedInfo.id).toBe(forkResult.metadata.id);

        // Verify partial.json was copied (as proxy for streaming state preservation)
        const forkedPartialPath = path.join(
          env.config.sessionsDir,
          forkResult.metadata.id,
          "partial.json"
        );
        const forkedPartialExists = await fs
          .access(forkedPartialPath)
          .then(() => true)
          .catch(() => false);
        expect(forkedPartialExists).toBe(true);

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
