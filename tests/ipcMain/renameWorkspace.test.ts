import { setupWorkspace, shouldRunIntegrationTests, validateApiKeys } from "./setup";
import {
  sendMessageWithModel,
  createEventCollector,
  waitForFileExists,
  waitForFileNotExists,
} from "./helpers";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";
import type { CmuxMessage } from "../../src/types/message";
import * as fs from "fs/promises";

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
          projectConfig.workspaces.push({ path: workspacePath });
          env.config.saveConfig(projectsConfig);
        }
        const oldSessionDir = env.config.getSessionDir(workspaceId);
        const oldMetadataResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_GET_INFO,
          workspaceId
        );
        expect(oldMetadataResult).toBeTruthy();
        const oldWorkspacePath = oldMetadataResult.workspacePath;

        // Verify old session directory exists (with retry for timing)
        const oldDirExists = await waitForFileExists(oldSessionDir);
        expect(oldDirExists).toBe(true);

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

        // Verify new session directory exists (with retry for timing)
        const newSessionDir = env.config.getSessionDir(newWorkspaceId);
        const newDirExists = await waitForFileExists(newSessionDir);
        expect(newDirExists).toBe(true);

        // Verify old session directory no longer exists (with retry for timing)
        const oldDirGone = await waitForFileNotExists(oldSessionDir);
        expect(oldDirGone).toBe(true);

        // Verify metadata was updated
        const newMetadataResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_GET_INFO,
          newWorkspaceId
        );
        expect(newMetadataResult).toBeTruthy();
        expect(newMetadataResult.id).toBe(newWorkspaceId);
        expect(newMetadataResult.projectName).toBe(projectName);
        expect(newMetadataResult.workspacePath).not.toBe(oldWorkspacePath);

        // Verify old workspace no longer exists
        const oldMetadataAfterRename = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_GET_INFO,
          workspaceId
        );
        expect(oldMetadataAfterRename).toBeNull();

        // Verify config was updated - workspace path should match new metadata
        const config = env.config.loadConfigOrDefault();
        let foundWorkspace = false;
        for (const [, projectConfig] of config.projects.entries()) {
          const workspace = projectConfig.workspaces.find(
            (w) => w.path === newMetadataResult.workspacePath
          );
          if (workspace) {
            foundWorkspace = true;
            break;
          }
        }
        expect(foundWorkspace).toBe(true);

        // Verify metadata events were emitted (delete old, create new)
        const metadataEvents = env.sentEvents.filter(
          (e) => e.channel === IPC_CHANNELS.WORKSPACE_METADATA
        );
        expect(metadataEvents.length).toBe(2);
        // First event should be deletion of old workspace
        expect(metadataEvents[0].data).toEqual({
          workspaceId,
          metadata: null,
        });
        // Second event should be creation of new workspace
        expect(metadataEvents[1].data).toMatchObject({
          workspaceId: newWorkspaceId,
          metadata: expect.objectContaining({
            id: newWorkspaceId,
            projectName,
          }),
        });
      } finally {
        await cleanup();
      }
    },
    15000
  );

  test.concurrent(
    "should fail to rename if new name conflicts with existing workspace",
    async () => {
      const { env, workspaceId, tempGitRepo, cleanup } = await setupWorkspace("anthropic");
      try {
        // Create a second workspace with a different branch
        const secondBranchName = "conflict-branch";
        const createResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_CREATE,
          tempGitRepo,
          secondBranchName
        );
        expect(createResult.success).toBe(true);

        // Try to rename first workspace to the second workspace's name
        const renameResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_RENAME,
          workspaceId,
          secondBranchName
        );
        expect(renameResult.success).toBe(false);
        expect(renameResult.error).toContain("already exists");

        // Verify original workspace still exists and wasn't modified
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
          projectConfig.workspaces.push({ path: workspacePath });
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
        expect(newMetadata.workspacePath).toBe(oldMetadata.workspacePath);
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
    "should block rename during active stream and require Esc first",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace("anthropic");
      try {
        // Clear events before starting stream
        env.sentEvents.length = 0;

        // Start a long-running stream
        void sendMessageWithModel(
          env.mockIpcRenderer,
          workspaceId,
          "Run this bash command: sleep 30 && echo done"
        );

        // Wait for stream to start
        const startCollector = createEventCollector(env.sentEvents, workspaceId);
        await startCollector.waitForEvent("stream-start", 10000);

        // Try to rename during active stream - should be blocked
        const renameResult = await env.mockIpcRenderer.invoke(
          IPC_CHANNELS.WORKSPACE_RENAME,
          workspaceId,
          "new-name"
        );
        expect(renameResult.success).toBe(false);
        expect(renameResult.error).toContain("stream is active");
        expect(renameResult.error).toContain("Press Esc");

        // Test passed - rename was successfully blocked during active stream
      } finally {
        await cleanup();
      }
    },
    15000
  );

  test.concurrent(
    "should fail to rename with invalid workspace name",
    async () => {
      const { env, workspaceId, cleanup } = await setupWorkspace("anthropic");
      try {
        // Test various invalid names
        const invalidNames = [
          { name: "", expectedError: "empty" },
          { name: "My-Branch", expectedError: "lowercase" },
          { name: "branch name", expectedError: "lowercase" },
          { name: "branch@123", expectedError: "lowercase" },
          { name: "branch/test", expectedError: "lowercase" },
          { name: "a".repeat(65), expectedError: "64 characters" },
        ];

        for (const { name, expectedError } of invalidNames) {
          const renameResult = await env.mockIpcRenderer.invoke(
            IPC_CHANNELS.WORKSPACE_RENAME,
            workspaceId,
            name
          );
          expect(renameResult.success).toBe(false);
          expect(renameResult.error.toLowerCase()).toContain(expectedError.toLowerCase());
        }

        // Verify original workspace still exists and wasn't modified
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
          projectConfig.workspaces.push({ path: workspacePath });
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
      const { env, workspaceId, workspacePath, tempGitRepo, cleanup } =
        await setupWorkspace("anthropic");
      try {
        // Add project and workspace to config via IPC
        await env.mockIpcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, tempGitRepo);
        // Manually add workspace to the project (normally done by WORKSPACE_CREATE)
        const projectsConfig = env.config.loadConfigOrDefault();
        const projectConfig = projectsConfig.projects.get(tempGitRepo);
        if (projectConfig) {
          projectConfig.workspaces.push({ path: workspacePath });
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
});
