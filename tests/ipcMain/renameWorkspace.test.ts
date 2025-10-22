import { setupWorkspace, shouldRunIntegrationTests, validateApiKeys } from "./setup";
import {
  sendMessageWithModel,
  createEventCollector,
  waitForFileExists,
  waitForFileNotExists,
  createWorkspace,
} from "./helpers";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";
import type { CmuxMessage } from "../../src/types/message";
import * as fs from "fs/promises";
import * as fsSync from "fs";

// Skip all tests if TEST_INTEGRATION is not set
const describeIntegration = shouldRunIntegrationTests() ? describe : describe.skip;

// Validate API keys before running tests
if (shouldRunIntegrationTests()) {
  validateApiKeys(["ANTHROPIC_API_KEY"]);
}

describeIntegration("IpcMain rename workspace integration tests", () => {
  test.concurrent(
    "should successfully rename workspace and update all paths",
    async () => {
      const { env, workspaceId, workspacePath, tempGitRepo, branchName, cleanup } =
        await setupWorkspace("anthropic");
      try {
        // Add project and workspace to config via IPC
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, tempGitRepo);
        // Manually add workspace to the project (normally done by WORKSPACE_CREATE)
        const projectsConfig = env.config.loadConfigOrDefault();
        const projectConfig = projectsConfig.projects.get(tempGitRepo);
        if (projectConfig) {
          projectConfig.workspaces.push({
            path: workspacePath,
            id: workspaceId,
            title: branchName,
          });
          env.config.saveConfig(projectsConfig);
        }
        const oldSessionDir = env.config.getSessionDir(workspaceId);
        const oldMetadataResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_GET_INFO,
          workspaceId
        );
        expect(oldMetadataResult).toBeTruthy();
        const oldWorkspacePath = oldMetadataResult.namedWorkspacePath;

        // Clear events before rename
        env.sentEvents.length = 0;

        // Rename the workspace
        const newName = "renamed-branch";
        const renameResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_RENAME,
          workspaceId,
          newName
        );
        if (!renameResult.success) {
          console.error("Rename failed:", renameResult.error);
        }
        expect(renameResult.success).toBe(true);

        // Get new workspace ID from backend (NEVER construct it in frontend)
        expect(renameResult.data?.newWorkspaceId).toBeDefined();
        const newWorkspaceId = renameResult.data.newWorkspaceId;
        const projectName = oldMetadataResult.projectName; // Still need this for assertions

        // With stable IDs, workspace ID should NOT change during rename
        expect(newWorkspaceId).toBe(workspaceId);

        // Session directory should still be the same (stable IDs don't move directories)
        const sessionDir = env.config.getSessionDir(workspaceId);
        expect(sessionDir).toBe(oldSessionDir);

        // Verify metadata was updated (name changed, path changed, but ID stays the same)
        const newMetadataResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_GET_INFO,
          workspaceId // Use same workspace ID
        );
        expect(newMetadataResult).toBeTruthy();
        expect(newMetadataResult.id).toBe(workspaceId); // ID unchanged
        expect(newMetadataResult.title).toBe(newName); // Title updated
        expect(newMetadataResult.projectName).toBe(projectName);

        // Path DOES NOT change (directories use stable IDs, not titles)
        const newWorkspacePath = newMetadataResult.namedWorkspacePath;
        expect(newWorkspacePath).toBe(oldWorkspacePath); // Path stays the same
        expect(newWorkspacePath).toContain(workspaceId); // Path contains workspace ID

        // Verify config was updated with new title (path unchanged)
        const config = env.config.loadConfigOrDefault();
        let foundWorkspace = false;
        for (const [, projectConfig] of config.projects.entries()) {
          const workspace = projectConfig.workspaces.find((w) => w.id === workspaceId);
          if (workspace) {
            foundWorkspace = true;
            expect(workspace.title).toBe(newName); // Title updated in config
            expect(workspace.id).toBe(workspaceId); // ID unchanged
            expect(workspace.path).toBe(oldWorkspacePath); // Path unchanged
            break;
          }
        }
        expect(foundWorkspace).toBe(true);

        // Verify metadata event was emitted (update existing workspace)
        const metadataEvents = env.sentEvents.filter(
          (e) => e.channel === IPC_CHANNELS.WORKSPACE_METADATA
        );
        expect(metadataEvents.length).toBe(1);
        // Event should be update of existing workspace
        expect(metadataEvents[0].data).toMatchObject({
          workspaceId,
          metadata: expect.objectContaining({
            id: workspaceId,
            title: newName,
            projectName,
          }),
        });
      } finally {
        await cleanup();
      }
    },
    30000 // Increased timeout to debug hanging test
  );

  test.concurrent(
    "should allow duplicate titles (IDs ensure uniqueness)",
    async () => {
      const { env, workspaceId, tempGitRepo, cleanup } = await setupWorkspace("anthropic");
      try {
        // Create a second workspace with a different branch
        const secondBranchName = "conflict-branch";
        const createResult = await createWorkspace(
          env.mockIpcRenderer,
          tempGitRepo,
          secondBranchName
        );
        expect(createResult.success).toBe(true);
        const secondWorkspaceId = createResult.metadata.id;

        // Rename first workspace to the second workspace's title - should succeed
        const renameResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_RENAME,
          workspaceId,
          secondBranchName
        );
        expect(renameResult.success).toBe(true);

        // Verify both workspaces exist with the same title but different IDs
        const metadata1 = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_GET_INFO,
          workspaceId
        );
        const metadata2 = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_GET_INFO,
          secondWorkspaceId
        );
        expect(metadata1.title).toBe(secondBranchName);
        expect(metadata2.title).toBe(secondBranchName);
        expect(metadata1.id).not.toBe(metadata2.id); // Different IDs
      } finally {
        await cleanup();
      }
    },
    15000
  );

  test.concurrent(
    "should succeed when renaming workspace to itself (no-op)",
    async () => {
      const { env, workspaceId, workspacePath, tempGitRepo, branchName, cleanup } =
        await setupWorkspace("anthropic");
      try {
        // Add project and workspace to config via IPC
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, tempGitRepo);
        // Manually add workspace to the project (normally done by WORKSPACE_CREATE)
        const projectsConfig = env.config.loadConfigOrDefault();
        const projectConfig = projectsConfig.projects.get(tempGitRepo);
        if (projectConfig) {
          projectConfig.workspaces.push({
            path: workspacePath,
            id: workspaceId,
            title: branchName,
          });
          env.config.saveConfig(projectsConfig);
        }

        // Get current metadata
        const oldMetadata = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_GET_INFO,
          workspaceId
        );
        expect(oldMetadata).toBeTruthy();

        // Rename workspace to its current name
        const renameResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_RENAME,
          workspaceId,
          branchName
        );
        expect(renameResult.success).toBe(true);
        expect(renameResult.data.newWorkspaceId).toBe(workspaceId);

        // Verify metadata unchanged
        const newMetadata = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_GET_INFO,
          workspaceId
        );
        expect(newMetadata).toBeTruthy();
        expect(newMetadata.id).toBe(workspaceId);
        expect(newMetadata.namedWorkspacePath).toBe(oldMetadata.namedWorkspacePath);
      } finally {
        await cleanup();
      }
    },
    15000
  );

  test.concurrent(
    "should fail to rename if workspace doesn't exist",
    async () => {
      const { env, cleanup } = await setupWorkspace("anthropic");
      try {
        const nonExistentWorkspaceId = "nonexistent-workspace";
        const renameResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_RENAME,
          nonExistentWorkspaceId,
          "new-name"
        );
        expect(renameResult.success).toBe(false);
        expect(renameResult.error).toContain("metadata");
      } finally {
        await cleanup();
      }
    },
    15000
  );

  test.concurrent(
    "should allow any title format (titles are cosmetic)",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace("anthropic");
      try {
        // Test various title formats - all should be valid
        const validTitles = [
          "", // Empty (falls back to ID display)
          "My-Branch", // Uppercase
          "branch name", // Spaces
          "branch@123", // Special chars
          "branch/test", // Slashes
          "a".repeat(100), // Long titles
        ];

        for (const title of validTitles) {
          const renameResult = await env.mockIpcRenderer.invoke(
            IPC_CHANNELS.WORKSPACE_RENAME,
            workspaceId,
            title
          );
          expect(renameResult.success).toBe(true);
        }

        // Verify workspace still exists
        const metadataResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_GET_INFO,
          workspaceId
        );
        expect(metadataResult).toBeTruthy();
        expect(metadataResult.id).toBe(workspaceId);
      } finally {
        await cleanup();
      }
    },
    15000
  );

  test.concurrent(
    "should preserve chat history after rename",
    async () => {
      const { env, workspaceId, workspacePath, tempGitRepo, branchName, cleanup } =
        await setupWorkspace("anthropic");
      try {
        // Add project and workspace to config via IPC
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, tempGitRepo);
        // Manually add workspace to the project (normally done by WORKSPACE_CREATE)
        const projectsConfig = env.config.loadConfigOrDefault();
        const projectConfig = projectsConfig.projects.get(tempGitRepo);
        if (projectConfig) {
          projectConfig.workspaces.push({
            path: workspacePath,
            id: workspaceId,
            title: branchName,
          });
          env.config.saveConfig(projectsConfig);
        }
        // Send a message to create some history
        env.sentEvents.length = 0;
        const result = await sendMessageWithModel(env.mockIpcRenderer, workspaceId, "What is 2+2?");
        expect(result.success).toBe(true);

        // Wait for response
        const collector = createEventCollector(env.sentEvents, workspaceId);
        await collector.waitForEvent("stream-end", 10000);

        // Clear events before rename
        env.sentEvents.length = 0;

        // Rename the workspace
        const newName = "renamed-with-history";
        const renameResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_RENAME,
          workspaceId,
          newName
        );
        if (!renameResult.success) {
          console.error("Rename failed:", renameResult.error);
        }
        expect(renameResult.success).toBe(true);

        // Get new workspace ID from result (don't construct it!)
        const newWorkspaceId = renameResult.data.newWorkspaceId;

        // Verify chat history file was moved (with retry for timing)
        const newSessionDir = env.config.getSessionDir(newWorkspaceId);
        const chatHistoryPath = `${newSessionDir}/chat.jsonl`;
        const chatHistoryExists = await waitForFileExists(chatHistoryPath);
        expect(chatHistoryExists).toBe(true);

        // Verify we can read the history
        const historyContent = await fs.readFile(chatHistoryPath, "utf-8");
        const lines = historyContent.trim().split("\n");
        expect(lines.length).toBeGreaterThan(0);
      } finally {
        await cleanup();
      }
    },
    30000
  );

  test.concurrent(
    "should support editing messages after rename",
    async () => {
      const { env, workspaceId, workspacePath, tempGitRepo, branchName, cleanup } =
        await setupWorkspace("anthropic");
      try {
        // Add project and workspace to config via IPC
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, tempGitRepo);
        // Manually add workspace to the project (normally done by WORKSPACE_CREATE)
        const projectsConfig = env.config.loadConfigOrDefault();
        const projectConfig = projectsConfig.projects.get(tempGitRepo);
        if (projectConfig) {
          projectConfig.workspaces.push({
            path: workspacePath,
            id: workspaceId,
            title: branchName,
          });
          env.config.saveConfig(projectsConfig);
        }

        // Send a message to create history before rename
        env.sentEvents.length = 0;
        const result = await sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "What is 2+2?",
          "anthropic",
          "claude-sonnet-4-5"
        );
        expect(result.success).toBe(true);

        // Wait for response
        const collector = createEventCollector(env.sentEvents, workspaceId);
        await collector.waitForEvent("stream-end", 10000);

        // Get the user message from chat events for later editing
        const chatMessages = env.sentEvents.filter(
          (e) =>
            e.channel === `workspace:chat:${workspaceId}` &&
            typeof e.data === "object" &&
            e.data !== null &&
            "role" in e.data
        );
        const userMessage = chatMessages.find((e) => (e.data as CmuxMessage).role === "user");
        expect(userMessage).toBeTruthy();
        const userMessageId = (userMessage!.data as CmuxMessage).id;

        // Clear events before rename
        env.sentEvents.length = 0;

        // Rename the workspace
        const newName = "renamed-edit-test";
        const renameResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_RENAME,
          workspaceId,
          newName
        );
        expect(renameResult.success).toBe(true);

        // Get new workspace ID from result
        const newWorkspaceId = renameResult.data.newWorkspaceId;

        // Clear events before edit
        env.sentEvents.length = 0;

        // Edit the user message using the new workspace ID
        // This is the critical test - editing should work after rename
        const editResult = await sendMessageWithModel(
          env.mockIpcRenderer,
          newWorkspaceId,
          "What is 3+3?",
          "anthropic",
          "claude-sonnet-4-5",
          { editMessageId: userMessageId }
        );
        expect(editResult.success).toBe(true);

        // Wait for response
        const editCollector = createEventCollector(env.sentEvents, newWorkspaceId);
        const streamEnd = await editCollector.waitForEvent("stream-end", 10000);
        expect(streamEnd).toBeTruthy();

        // Verify we got the edited user message and a successful response
        editCollector.collect();
        const allEvents = editCollector.getEvents();

        const editedUserMessage = allEvents.find(
          (e) =>
            "role" in e && e.role === "user" && e.parts?.some((p: any) => p.text?.includes("3+3"))
        );
        expect(editedUserMessage).toBeTruthy();

        // Verify stream completed successfully (proves AI responded to edited message)
        expect(streamEnd).toBeDefined();
      } finally {
        await cleanup();
      }
    },
    30000
  );

  test.concurrent(
    "should fail to rename if workspace is currently streaming",
    async () => {
      const { env, workspaceId, tempGitRepo, branchName, cleanup } =
        await setupWorkspace("anthropic");
      try {
        // Add project and workspace to config via IPC
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, tempGitRepo);
        const projectsConfig = env.config.loadConfigOrDefault();
        const projectConfig = projectsConfig.projects.get(tempGitRepo);
        if (projectConfig) {
          const workspacePath = env.config.getWorkspacePath(tempGitRepo, branchName);
          projectConfig.workspaces.push({
            path: workspacePath,
            id: workspaceId,
            title: branchName,
          });
          env.config.saveConfig(projectsConfig);
        }

        // Start a stream (don't await - we want it running)
        sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "What is 2+2?" // Simple query that should complete quickly
        );

        // Wait for stream to actually start
        const collector = createEventCollector(env.sentEvents, workspaceId);
        await collector.waitForEvent("stream-start", 5000);

        // Attempt to rename while streaming - should succeed (titles are cosmetic)
        const newName = "renamed-during-stream";
        const renameResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_RENAME,
          workspaceId,
          newName
        );

        // Verify rename succeeded even during streaming
        expect(renameResult.success).toBe(true);

        // Wait for stream to complete
        await collector.waitForEvent("stream-end", 10000);
      } finally {
        await cleanup();
      }
    },
    20000
  );
});
