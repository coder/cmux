import type { BrowserWindow, IpcMain as ElectronIpcMain } from "electron";
import { spawn, spawnSync } from "child_process";
import * as path from "path";
import * as fsPromises from "fs/promises";
import type { Config, ProjectConfig } from "@/config";
import {
  createWorktree,
  removeWorktree,
  moveWorktree,
  pruneWorktrees,
  getMainWorktreeFromWorktree,
  listLocalBranches,
  detectDefaultTrunkBranch,
} from "@/git";
import { AIService } from "@/services/aiService";
import { HistoryService } from "@/services/historyService";
import { PartialService } from "@/services/partialService";
import { createCmuxMessage, type CmuxMessage } from "@/types/message";
import { log } from "@/services/log";
import type {
  StreamStartEvent,
  StreamDeltaEvent,
  StreamEndEvent,
  StreamAbortEvent,
  ToolCallStartEvent,
  ToolCallDeltaEvent,
  ToolCallEndEvent,
  ErrorEvent,
} from "@/types/stream";
import { IPC_CHANNELS, getChatChannel } from "@/constants/ipc-constants";
import type { SendMessageError } from "@/types/errors";
import type { StreamErrorMessage, SendMessageOptions, DeleteMessage } from "@/types/ipc";
import { Ok, Err, type Result } from "@/types/result";
import { validateWorkspaceName } from "@/utils/validation/workspaceValidation";
import { createBashTool } from "@/services/tools/bash";
import type { BashToolResult } from "@/types/tools";

import { secretsToRecord } from "@/types/secrets";

const createUnknownSendMessageError = (raw: string): SendMessageError => ({
  type: "unknown",
  raw,
});

/**
 * IpcMain - Manages all IPC handlers and service coordination
 *
 * This class encapsulates:
 * - All ipcMain handler registration
 * - Service lifecycle management (AIService, HistoryService, PartialService)
 * - Event forwarding from services to renderer
 *
 * Design:
 * - Constructor accepts only Config for dependency injection
 * - Services are created internally from Config
 * - register() accepts ipcMain and BrowserWindow for handler setup
 */
export class IpcMain {
  private readonly config: Config;
  private readonly historyService: HistoryService;
  private readonly partialService: PartialService;
  private readonly aiService: AIService;
  private mainWindow: BrowserWindow | null = null;
  private registered = false;

  constructor(config: Config) {
    this.config = config;
    this.historyService = new HistoryService(config);
    this.partialService = new PartialService(config, this.historyService);
    this.aiService = new AIService(config, this.historyService, this.partialService);
  }

  /**
   * Register all IPC handlers and setup event forwarding
   * @param ipcMain - Electron's ipcMain module
   * @param mainWindow - The main BrowserWindow for sending events
   */
  register(ipcMain: ElectronIpcMain, mainWindow: BrowserWindow): void {
    // Always update the window reference (windows can be recreated on macOS)
    this.mainWindow = mainWindow;

    // Skip registration if handlers are already registered
    // This prevents "handler already registered" errors when windows are recreated
    if (this.registered) {
      return;
    }

    this.registerDialogHandlers(ipcMain);
    this.registerWindowHandlers(ipcMain);
    this.registerWorkspaceHandlers(ipcMain);
    this.registerProviderHandlers(ipcMain);
    this.registerProjectHandlers(ipcMain);
    this.registerSubscriptionHandlers(ipcMain);
    this.setupEventForwarding();
    this.registered = true;
  }

  private registerDialogHandlers(ipcMain: ElectronIpcMain): void {
    ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_DIR, async () => {
      if (!this.mainWindow) return null;

      // Dynamic import to avoid issues with electron mocks in tests
      // eslint-disable-next-line no-restricted-syntax
      const { dialog } = await import("electron");

      const result = await dialog.showOpenDialog(this.mainWindow, {
        properties: ["openDirectory"],
      });

      if (result.canceled) {
        return null;
      }

      return result.filePaths[0];
    });
  }

  private registerWindowHandlers(ipcMain: ElectronIpcMain): void {
    ipcMain.handle(IPC_CHANNELS.WINDOW_SET_TITLE, (_event, title: string) => {
      if (!this.mainWindow) return;
      this.mainWindow.setTitle(title);
    });
  }

  /**
   * Helper method: Stream AI response with history
   * Shared logic between sendMessage and resumeStream handlers
   */
  private async streamWithHistory(
    workspaceId: string,
    modelString: string,
    options?: SendMessageOptions
  ): Promise<Result<void, SendMessageError>> {
    const {
      thinkingLevel,
      toolPolicy,
      additionalSystemInstructions,
      maxOutputTokens,
      providerOptions,
      mode,
    } = options ?? {};

    // Commit any existing partial to history BEFORE loading
    // This ensures interrupted messages are included in the AI's context
    await this.partialService.commitToHistory(workspaceId);

    // Get full conversation history
    const historyResult = await this.historyService.getHistory(workspaceId);
    if (!historyResult.success) {
      log.error("Failed to get conversation history:", historyResult.error);
      return {
        success: false,
        error: createUnknownSendMessageError(historyResult.error),
      };
    }

    // Stream the AI response
    log.debug("Calling aiService.streamMessage", {
      workspaceId,
      thinkingLevel,
      modelString,
      toolPolicy,
      additionalSystemInstructions,
      maxOutputTokens,
      providerOptions,
    });

    const streamResult = await this.aiService.streamMessage(
      historyResult.data,
      workspaceId,
      modelString,
      thinkingLevel,
      toolPolicy,
      undefined,
      additionalSystemInstructions,
      maxOutputTokens,
      providerOptions,
      mode
    );
    log.debug("Stream completed", { workspaceId });
    return streamResult;
  }

  private registerWorkspaceHandlers(ipcMain: ElectronIpcMain): void {
    ipcMain.handle(
      IPC_CHANNELS.WORKSPACE_CREATE,
      async (_event, projectPath: string, branchName: string, trunkBranch: string) => {
        // Validate workspace name
        const validation = validateWorkspaceName(branchName);
        if (!validation.valid) {
          return { success: false, error: validation.error };
        }

        if (typeof trunkBranch !== "string" || trunkBranch.trim().length === 0) {
          return { success: false, error: "Trunk branch is required" };
        }

        const normalizedTrunkBranch = trunkBranch.trim();

        // First create the git worktree
        const result = await createWorktree(this.config, projectPath, branchName, {
          trunkBranch: normalizedTrunkBranch,
        });

        if (result.success && result.path) {
          const projectName =
            projectPath.split("/").pop() ?? projectPath.split("\\").pop() ?? "unknown";

          // Generate workspace ID using central method
          const workspaceId = this.config.generateWorkspaceId(projectPath, result.path);

          // Initialize workspace metadata
          const metadata = {
            id: workspaceId,
            projectName,
            workspacePath: result.path,
          };
          await this.aiService.saveWorkspaceMetadata(workspaceId, metadata);

          // Update config to include the new workspace
          this.config.editConfig((config) => {
            let projectConfig = config.projects.get(projectPath);
            if (!projectConfig) {
              // Create project config if it doesn't exist
              projectConfig = {
                path: projectPath,
                workspaces: [],
              };
              config.projects.set(projectPath, projectConfig);
            }
            // Add workspace to project config
            projectConfig.workspaces.push({
              path: result.path!,
            });
            return config;
          });

          // Emit metadata event for new workspace
          this.mainWindow?.webContents.send(IPC_CHANNELS.WORKSPACE_METADATA, {
            workspaceId,
            metadata,
          });

          return {
            success: true,
            metadata,
          };
        }

        return { success: false, error: result.error ?? "Failed to create workspace" };
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.WORKSPACE_REMOVE,
      async (_event, workspaceId: string, options?: { force?: boolean }) => {
        return this.removeWorkspaceInternal(workspaceId, { force: options?.force ?? false });
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.WORKSPACE_RENAME,
      async (_event, workspaceId: string, newName: string) => {
        try {
          // Validate workspace name
          const validation = validateWorkspaceName(newName);
          if (!validation.valid) {
            return Err(validation.error ?? "Invalid workspace name");
          }

          // Block rename if there's an active stream
          if (this.aiService.isStreaming(workspaceId)) {
            return Err(
              "Cannot rename workspace while stream is active. Press Esc to stop the stream first."
            );
          }

          // Get current metadata
          const metadataResult = await this.aiService.getWorkspaceMetadata(workspaceId);
          if (!metadataResult.success) {
            return Err(`Failed to get workspace metadata: ${metadataResult.error}`);
          }
          const oldMetadata = metadataResult.data;

          // Calculate new workspace ID
          const newWorkspaceId = `${oldMetadata.projectName}-${newName}`;

          // If renaming to itself, just return success (no-op)
          if (newWorkspaceId === workspaceId) {
            return Ok({ newWorkspaceId });
          }

          // Check if new workspace ID already exists
          const existingMetadata = await this.aiService.getWorkspaceMetadata(newWorkspaceId);
          if (existingMetadata.success) {
            return Err(`Workspace with name "${newName}" already exists`);
          }

          // Get old and new session directory paths
          const oldSessionDir = this.config.getSessionDir(workspaceId);
          const newSessionDir = this.config.getSessionDir(newWorkspaceId);

          // Find project path from config (needed for git operations)
          const projectsConfig = this.config.loadConfigOrDefault();
          let foundProjectPath: string | null = null;
          let workspaceIndex = -1;

          for (const [projectPath, projectConfig] of projectsConfig.projects.entries()) {
            const idx = projectConfig.workspaces.findIndex((w) => {
              const generatedId = this.config.generateWorkspaceId(projectPath, w.path);
              return generatedId === workspaceId;
            });

            if (idx !== -1) {
              foundProjectPath = projectPath;
              workspaceIndex = idx;
              break;
            }
          }

          if (!foundProjectPath) {
            return Err("Failed to find project path for workspace");
          }

          // Rename session directory
          await fsPromises.rename(oldSessionDir, newSessionDir);

          // Migrate workspace IDs in history messages
          const migrateResult = await this.historyService.migrateWorkspaceId(
            workspaceId,
            newWorkspaceId
          );
          if (!migrateResult.success) {
            // Rollback session directory rename
            await fsPromises.rename(newSessionDir, oldSessionDir);
            return Err(`Failed to migrate message workspace IDs: ${migrateResult.error}`);
          }

          // Calculate new worktree path
          const oldWorktreePath = oldMetadata.workspacePath;
          const newWorktreePath = path.join(
            path.dirname(oldWorktreePath),
            newName // Use newName as the directory name
          );

          // Move worktree directory
          const moveResult = await moveWorktree(foundProjectPath, oldWorktreePath, newWorktreePath);
          if (!moveResult.success) {
            // Rollback session directory rename
            await fsPromises.rename(newSessionDir, oldSessionDir);
            return Err(`Failed to move worktree: ${moveResult.error}`);
          }

          // Update metadata with new ID and path
          const newMetadata = {
            id: newWorkspaceId,
            projectName: oldMetadata.projectName,
            workspacePath: newWorktreePath,
          };

          const saveResult = await this.aiService.saveWorkspaceMetadata(
            newWorkspaceId,
            newMetadata
          );
          if (!saveResult.success) {
            // Rollback worktree and session directory
            await moveWorktree(foundProjectPath, newWorktreePath, oldWorktreePath);
            await fsPromises.rename(newSessionDir, oldSessionDir);
            return Err(`Failed to save new metadata: ${saveResult.error}`);
          }

          // Update config with new workspace info using atomic edit
          this.config.editConfig((config) => {
            const projectConfig = config.projects.get(foundProjectPath);
            if (projectConfig && workspaceIndex !== -1) {
              projectConfig.workspaces[workspaceIndex] = {
                path: newWorktreePath,
              };
            }
            return config;
          });

          // Emit metadata event for old workspace deletion
          this.mainWindow?.webContents.send(IPC_CHANNELS.WORKSPACE_METADATA, {
            workspaceId,
            metadata: null,
          });

          // Emit metadata event for new workspace
          this.mainWindow?.webContents.send(IPC_CHANNELS.WORKSPACE_METADATA, {
            workspaceId: newWorkspaceId,
            metadata: newMetadata,
          });

          return Ok({ newWorkspaceId });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return Err(`Failed to rename workspace: ${message}`);
        }
      }
    );

    ipcMain.handle(IPC_CHANNELS.WORKSPACE_LIST, () => {
      try {
        return this.config.getAllWorkspaceMetadata();
      } catch (error) {
        console.error("Failed to list workspaces:", error);
        return [];
      }
    });

    ipcMain.handle(IPC_CHANNELS.WORKSPACE_GET_INFO, async (_event, workspaceId: string) => {
      const result = await this.aiService.getWorkspaceMetadata(workspaceId);
      return result.success ? result.data : null;
    });

    ipcMain.handle(
      IPC_CHANNELS.WORKSPACE_SEND_MESSAGE,
      async (
        _event,
        workspaceId: string,
        message: string,
        options?: SendMessageOptions & { imageParts?: Array<{ image: string; mimeType: string }> }
      ) => {
        const {
          editMessageId,
          thinkingLevel,
          model,
          toolPolicy,
          additionalSystemInstructions,
          maxOutputTokens,
          providerOptions,
          imageParts,
          mode,
        } = options ?? {};
        log.debug("sendMessage handler: Received", {
          workspaceId,
          messagePreview: message.substring(0, 50),
          editMessageId,
          thinkingLevel,
          model,
          toolPolicy,
          additionalSystemInstructions,
          maxOutputTokens,
          providerOptions,
        });
        try {
          // Reject empty messages - use interruptStream() to interrupt active streams
          if (!message.trim() && (!imageParts || imageParts.length === 0)) {
            log.debug("sendMessage handler: Rejected empty message (use interruptStream instead)");
            return {
              success: false,
              error: {
                type: "unknown",
                raw: "Empty message not allowed. Use interruptStream() to interrupt active streams.",
              },
            };
          }

          // If editing, truncate history after the message being edited
          if (editMessageId) {
            const truncateResult = await this.historyService.truncateAfterMessage(
              workspaceId,
              editMessageId
            );
            if (!truncateResult.success) {
              log.error("Failed to truncate history for edit:", truncateResult.error);
              return {
                success: false,
                error: createUnknownSendMessageError(truncateResult.error),
              };
            }
            // Note: We don't send a clear event here. The aggregator will handle
            // replacement automatically when the new message arrives with the same historySequence
          }

          // Create user message with text and optional image parts
          const messageId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
          const additionalParts = imageParts?.map((img) => ({
            type: "image" as const,
            image: img.image,
            mimeType: img.mimeType,
          }));
          if (additionalParts && additionalParts.length > 0) {
            log.debug("sendMessage: Creating message with images", {
              imageCount: additionalParts.length,
              mimeTypes: additionalParts.map((p) => p.mimeType),
            });
          }
          const userMessage = createCmuxMessage(
            messageId,
            "user",
            message,
            {
              // historySequence will be assigned by historyService.appendToHistory()
              timestamp: Date.now(),
              toolPolicy, // Store for historical record and compaction detection
            },
            additionalParts
          );

          // Append user message to history
          const appendResult = await this.historyService.appendToHistory(workspaceId, userMessage);
          if (!appendResult.success) {
            log.error("Failed to append message to history:", appendResult.error);
            return {
              success: false,
              error: createUnknownSendMessageError(appendResult.error),
            };
          }

          // Broadcast the user message immediately to the frontend
          if (this.mainWindow) {
            this.mainWindow.webContents.send(getChatChannel(workspaceId), userMessage);
          }

          // Stream the AI response
          if (!model) {
            log.error("No model provided by frontend");
            return {
              success: false,
              error: createUnknownSendMessageError(
                "No model specified. Please select a model using /model command."
              ),
            };
          }

          return await this.streamWithHistory(workspaceId, model, options);
        } catch (error) {
          // Convert to SendMessageError for typed error handling
          const errorMessage = error instanceof Error ? error.message : String(error);
          log.error("Unexpected error in sendMessage handler:", error);
          const sendError: SendMessageError = {
            type: "unknown",
            raw: `Failed to send message: ${errorMessage}`,
          };
          return { success: false, error: sendError };
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.WORKSPACE_RESUME_STREAM,
      async (_event, workspaceId: string, options: SendMessageOptions) => {
        log.debug("resumeStream handler: Received", {
          workspaceId,
          options,
        });
        try {
          // Idempotent: if stream already active, return success (not error)
          // This makes client code simpler and more resilient
          if (this.aiService.isStreaming(workspaceId)) {
            log.debug("resumeStream handler: Stream already active, returning success");
            return { success: true };
          }

          // Stream the AI response with existing history (no new user message)
          return await this.streamWithHistory(workspaceId, options.model, options);
        } catch (error) {
          // Convert to SendMessageError for typed error handling
          const errorMessage = error instanceof Error ? error.message : String(error);
          log.error("Unexpected error in resumeStream handler:", error);
          const sendError: SendMessageError = {
            type: "unknown",
            raw: `Failed to resume stream: ${errorMessage}`,
          };
          return { success: false, error: sendError };
        }
      }
    );

    ipcMain.handle(IPC_CHANNELS.WORKSPACE_INTERRUPT_STREAM, async (_event, workspaceId: string) => {
      log.debug("interruptStream handler: Received", { workspaceId });
      try {
        // Idempotent: if not streaming, return success (not error)
        if (!this.aiService.isStreaming(workspaceId)) {
          log.debug("interruptStream handler: Not streaming, returning success");
          return { success: true, data: undefined };
        }

        const stopResult = await this.aiService.stopStream(workspaceId);
        if (!stopResult.success) {
          log.error("Failed to stop stream:", stopResult.error);
          return { success: false, error: stopResult.error };
        }
        return { success: true, data: undefined };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log.error("Unexpected error in interruptStream handler:", error);
        return { success: false, error: `Failed to interrupt stream: ${errorMessage}` };
      }
    });

    ipcMain.handle(
      IPC_CHANNELS.WORKSPACE_TRUNCATE_HISTORY,
      async (_event, workspaceId: string, percentage?: number) => {
        // Block truncate if there's an active stream
        // User must press Esc first to stop stream and commit partial to history
        if (this.aiService.isStreaming(workspaceId)) {
          return {
            success: false,
            error:
              "Cannot truncate history while stream is active. Press Esc to stop the stream first.",
          };
        }

        // Truncate chat.jsonl (only operates on committed history)
        // Note: partial.json is NOT touched here - it has its own lifecycle
        // Interrupted messages are committed to history by stream-abort handler
        const truncateResult = await this.historyService.truncateHistory(
          workspaceId,
          percentage ?? 1.0
        );
        if (!truncateResult.success) {
          return { success: false, error: truncateResult.error };
        }

        // Send DeleteMessage event to frontend with deleted historySequence numbers
        const deletedSequences = truncateResult.data;
        if (deletedSequences.length > 0 && this.mainWindow) {
          const deleteMessage: DeleteMessage = {
            type: "delete",
            historySequences: deletedSequences,
          };
          this.mainWindow.webContents.send(getChatChannel(workspaceId), deleteMessage);
        }

        return { success: true, data: undefined };
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.WORKSPACE_REPLACE_HISTORY,
      async (_event, workspaceId: string, summaryMessage: CmuxMessage) => {
        // Block replace if there's an active stream, UNLESS this is a compacted message
        // (which is called from stream-end handler before stream cleanup completes)
        const isCompaction = summaryMessage.metadata?.compacted === true;
        if (!isCompaction && this.aiService.isStreaming(workspaceId)) {
          return Err(
            "Cannot replace history while stream is active. Press Esc to stop the stream first."
          );
        }

        try {
          // Get all existing messages to collect their historySequence numbers
          const historyResult = await this.historyService.getHistory(workspaceId);
          const deletedSequences = historyResult.success
            ? historyResult.data
                .map((msg) => msg.metadata?.historySequence ?? -1)
                .filter((s) => s >= 0)
            : [];

          // Clear entire history
          const clearResult = await this.historyService.clearHistory(workspaceId);
          if (!clearResult.success) {
            return Err(`Failed to clear history: ${clearResult.error}`);
          }

          // Append the summary message to history (gets historySequence assigned by backend)
          // Frontend provides the message with all metadata (compacted, timestamp, etc.)
          const appendResult = await this.historyService.appendToHistory(
            workspaceId,
            summaryMessage
          );
          if (!appendResult.success) {
            return Err(`Failed to append summary: ${appendResult.error}`);
          }

          // Send delete event to frontend for all old messages
          if (deletedSequences.length > 0 && this.mainWindow) {
            const deleteMessage: DeleteMessage = {
              type: "delete",
              historySequences: deletedSequences,
            };
            this.mainWindow.webContents.send(getChatChannel(workspaceId), deleteMessage);
          }

          // Send the new summary message to frontend
          if (this.mainWindow) {
            this.mainWindow.webContents.send(getChatChannel(workspaceId), summaryMessage);
          }

          return Ok(undefined);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return Err(`Failed to replace history: ${message}`);
        }
      }
    );

    ipcMain.handle(
      IPC_CHANNELS.WORKSPACE_EXECUTE_BASH,
      async (
        _event,
        workspaceId: string,
        script: string,
        options?: { timeout_secs?: number; niceness?: number }
      ) => {
        try {
          // Get workspace metadata to find workspacePath
          const metadataResult = await this.aiService.getWorkspaceMetadata(workspaceId);
          if (!metadataResult.success) {
            return Err(`Failed to get workspace metadata: ${metadataResult.error}`);
          }

          const workspacePath = metadataResult.data.workspacePath;

          // Find project path for this workspace to load secrets
          const workspaceInfo = this.config.findWorkspace(workspaceId);
          const projectSecrets = workspaceInfo
            ? this.config.getProjectSecrets(workspaceInfo.projectPath)
            : [];

          // Create bash tool with workspace's cwd and secrets
          const bashTool = createBashTool({
            cwd: workspacePath,
            secrets: secretsToRecord(projectSecrets),
            niceness: options?.niceness,
          });

          // Execute the script with provided options
          const result = (await bashTool.execute!(
            {
              script,
              timeout_secs: options?.timeout_secs ?? 120,
            },
            {
              toolCallId: `bash-${Date.now()}`,
              messages: [],
            }
          )) as BashToolResult;

          return Ok(result);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return Err(`Failed to execute bash command: ${message}`);
        }
      }
    );

    ipcMain.handle(IPC_CHANNELS.WORKSPACE_OPEN_TERMINAL, (_event, workspacePath: string) => {
      try {
        if (process.platform === "darwin") {
          // macOS - try Ghostty first, fallback to Terminal.app
          const terminal = this.findAvailableCommand(["ghostty", "terminal"]);
          if (terminal === "ghostty") {
            spawn("open", ["-a", "Ghostty", workspacePath], { detached: true });
          } else {
            spawn("open", ["-a", "Terminal", workspacePath], { detached: true });
          }
        } else if (process.platform === "win32") {
          // Windows
          spawn("cmd", ["/c", "start", "cmd", "/K", "cd", "/D", workspacePath], {
            detached: true,
            shell: true,
          });
        } else {
          // Linux - try terminal emulators in order of preference
          // x-terminal-emulator is checked first as it respects user's system-wide preference
          const terminals = [
            { cmd: "x-terminal-emulator", args: [], cwd: workspacePath },
            { cmd: "ghostty", args: ["--working-directory=" + workspacePath] },
            { cmd: "alacritty", args: ["--working-directory", workspacePath] },
            { cmd: "kitty", args: ["--directory", workspacePath] },
            { cmd: "wezterm", args: ["start", "--cwd", workspacePath] },
            { cmd: "gnome-terminal", args: ["--working-directory", workspacePath] },
            { cmd: "konsole", args: ["--workdir", workspacePath] },
            { cmd: "xfce4-terminal", args: ["--working-directory", workspacePath] },
            { cmd: "xterm", args: [], cwd: workspacePath },
          ];

          const availableTerminal = terminals.find((t) => this.isCommandAvailable(t.cmd));

          if (availableTerminal) {
            const child = spawn(availableTerminal.cmd, availableTerminal.args, {
              cwd: availableTerminal.cwd ?? workspacePath,
              detached: true,
              stdio: "ignore",
            });
            child.unref();
            log.info(`Opened terminal ${availableTerminal.cmd} at ${workspacePath}`);
          } else {
            log.error(
              "No terminal emulator found. Tried: " + terminals.map((t) => t.cmd).join(", ")
            );
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Failed to open terminal: ${message}`);
      }
    });
  }

  /**
   * Internal workspace removal logic shared by both force and non-force deletion
   */
  private async removeWorkspaceInternal(
    workspaceId: string,
    options: { force: boolean }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get workspace path from metadata
      const metadataResult = await this.aiService.getWorkspaceMetadata(workspaceId);
      if (!metadataResult.success) {
        // If metadata doesn't exist, workspace is already gone - consider it success
        log.info(`Workspace ${workspaceId} metadata not found, considering removal successful`);
        return { success: true };
      }

      const workspacePath = metadataResult.data.workspacePath;

      // Get project path from the worktree itself
      const foundProjectPath = await getMainWorktreeFromWorktree(workspacePath);

      // Remove git worktree if we found the project path
      if (foundProjectPath) {
        const worktreeExists = await fsPromises
          .access(workspacePath)
          .then(() => true)
          .catch(() => false);

        if (worktreeExists) {
          const gitResult = await removeWorktree(foundProjectPath, workspacePath, {
            force: options.force,
          });
          if (!gitResult.success) {
            const errorMessage = gitResult.error ?? "Unknown error";
            const normalizedError = errorMessage.toLowerCase();
            const looksLikeMissingWorktree =
              normalizedError.includes("not a working tree") ||
              normalizedError.includes("does not exist") ||
              normalizedError.includes("no such file");

            if (looksLikeMissingWorktree) {
              const pruneResult = await pruneWorktrees(foundProjectPath);
              if (!pruneResult.success) {
                log.info(
                  `Failed to prune stale worktrees for ${foundProjectPath} after removeWorktree error: ${
                    pruneResult.error ?? "unknown error"
                  }`
                );
              }
            } else {
              return gitResult;
            }
          }
        } else {
          const pruneResult = await pruneWorktrees(foundProjectPath);
          if (!pruneResult.success) {
            log.info(
              `Failed to prune stale worktrees for ${foundProjectPath} after detecting missing workspace at ${workspacePath}: ${
                pruneResult.error ?? "unknown error"
              }`
            );
          }
        }
      }

      // Remove the workspace from AI service
      const aiResult = await this.aiService.deleteWorkspace(workspaceId);
      if (!aiResult.success) {
        return { success: false, error: aiResult.error };
      }

      // Update config to remove the workspace from all projects
      // We iterate through all projects instead of relying on foundProjectPath
      // because the worktree might be deleted (so getMainWorktreeFromWorktree fails)
      const projectsConfig = this.config.loadConfigOrDefault();
      let configUpdated = false;
      for (const [_projectPath, projectConfig] of projectsConfig.projects.entries()) {
        const initialCount = projectConfig.workspaces.length;
        projectConfig.workspaces = projectConfig.workspaces.filter((w) => w.path !== workspacePath);
        if (projectConfig.workspaces.length < initialCount) {
          configUpdated = true;
        }
      }
      if (configUpdated) {
        this.config.saveConfig(projectsConfig);
      }

      // Emit metadata event for workspace removal (with null metadata to indicate deletion)
      this.mainWindow?.webContents.send(IPC_CHANNELS.WORKSPACE_METADATA, {
        workspaceId,
        metadata: null, // null indicates workspace was deleted
      });

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Failed to remove workspace: ${message}` };
    }
  }

  private registerProviderHandlers(ipcMain: ElectronIpcMain): void {
    ipcMain.handle(
      IPC_CHANNELS.PROVIDERS_SET_CONFIG,
      (_event, provider: string, keyPath: string[], value: string) => {
        try {
          // Load current providers config or create empty
          const providersConfig = this.config.loadProvidersConfig() ?? {};

          // Ensure provider exists
          if (!providersConfig[provider]) {
            providersConfig[provider] = {};
          }

          // Set nested property value
          let current = providersConfig[provider] as Record<string, unknown>;
          for (let i = 0; i < keyPath.length - 1; i++) {
            const key = keyPath[i];
            if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
              current[key] = {};
            }
            current = current[key] as Record<string, unknown>;
          }

          if (keyPath.length > 0) {
            current[keyPath[keyPath.length - 1]] = value;
          }

          // Save updated config
          this.config.saveProvidersConfig(providersConfig);

          return { success: true, data: undefined };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return { success: false, error: `Failed to set provider config: ${message}` };
        }
      }
    );

    ipcMain.handle(IPC_CHANNELS.PROVIDERS_LIST, () => {
      try {
        // Return all supported providers, not just configured ones
        // This matches the providers defined in the registry
        return ["anthropic", "openai", "google"];
      } catch (error) {
        log.error("Failed to list providers:", error);
        return [];
      }
    });
  }

  private registerProjectHandlers(ipcMain: ElectronIpcMain): void {
    ipcMain.handle(IPC_CHANNELS.PROJECT_CREATE, (_event, projectPath: string) => {
      try {
        const config = this.config.loadConfigOrDefault();

        // Check if project already exists
        if (config.projects.has(projectPath)) {
          return Err("Project already exists");
        }

        // Create new project config
        const projectConfig: ProjectConfig = {
          path: projectPath,
          workspaces: [],
        };

        // Add to config
        config.projects.set(projectPath, projectConfig);
        this.config.saveConfig(config);

        return Ok(projectConfig);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err(`Failed to create project: ${message}`);
      }
    });

    ipcMain.handle(IPC_CHANNELS.PROJECT_REMOVE, (_event, projectPath: string) => {
      try {
        const config = this.config.loadConfigOrDefault();
        const projectConfig = config.projects.get(projectPath);

        if (!projectConfig) {
          return Err("Project not found");
        }

        // Check if project has any workspaces
        if (projectConfig.workspaces.length > 0) {
          return Err(
            `Cannot remove project with active workspaces. Please remove all ${projectConfig.workspaces.length} workspace(s) first.`
          );
        }

        // Remove project from config
        config.projects.delete(projectPath);
        this.config.saveConfig(config);

        // Also remove project secrets if any
        try {
          this.config.updateProjectSecrets(projectPath, []);
        } catch (error) {
          log.error(`Failed to clean up secrets for project ${projectPath}:`, error);
          // Continue - don't fail the whole operation if secrets cleanup fails
        }

        return Ok(undefined);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err(`Failed to remove project: ${message}`);
      }
    });

    ipcMain.handle(IPC_CHANNELS.PROJECT_LIST, () => {
      try {
        const config = this.config.loadConfigOrDefault();
        return Array.from(config.projects.values());
      } catch (error) {
        log.error("Failed to list projects:", error);
        return [];
      }
    });

    ipcMain.handle(IPC_CHANNELS.PROJECT_LIST_BRANCHES, async (_event, projectPath: string) => {
      if (typeof projectPath !== "string" || projectPath.trim().length === 0) {
        throw new Error("Project path is required to list branches");
      }

      try {
        const branches = await listLocalBranches(projectPath);
        const recommendedTrunk = await detectDefaultTrunkBranch(projectPath, branches);
        return { branches, recommendedTrunk };
      } catch (error) {
        log.error("Failed to list branches:", error);
        throw error instanceof Error ? error : new Error(String(error));
      }
    });

    ipcMain.handle(IPC_CHANNELS.PROJECT_SECRETS_GET, (_event, projectPath: string) => {
      try {
        return this.config.getProjectSecrets(projectPath);
      } catch (error) {
        log.error("Failed to get project secrets:", error);
        return [];
      }
    });

    ipcMain.handle(
      IPC_CHANNELS.PROJECT_SECRETS_UPDATE,
      (_event, projectPath: string, secrets: Array<{ key: string; value: string }>) => {
        try {
          this.config.updateProjectSecrets(projectPath, secrets);
          return Ok(undefined);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return Err(`Failed to update project secrets: ${message}`);
        }
      }
    );
  }

  private registerSubscriptionHandlers(ipcMain: ElectronIpcMain): void {
    // Handle subscription events for chat history
    ipcMain.on(`workspace:chat:subscribe`, (_event, workspaceId: string) => {
      void (async () => {
        const chatChannel = getChatChannel(workspaceId);

        const history = await this.historyService.getHistory(workspaceId);
        if (history.success) {
          for (const msg of history.data) {
            this.mainWindow?.webContents.send(chatChannel, msg);
          }

          // Check if there's an active stream or a partial message
          const streamInfo = this.aiService.getStreamInfo(workspaceId);
          const partial = await this.partialService.readPartial(workspaceId);

          if (streamInfo) {
            // Stream is actively running - replay events to re-establish streaming context
            // Events flow: StreamManager → AIService → IpcMain → renderer
            // This ensures frontend receives stream-start and creates activeStream entry
            // so that stream-end can properly clean up the streaming indicator
            this.aiService.replayStream(workspaceId);
          } else if (partial) {
            // No active stream but there's a partial - send as regular message (shows CONTINUE)
            this.mainWindow?.webContents.send(chatChannel, partial);
          }
        }

        this.mainWindow?.webContents.send(chatChannel, { type: "caught-up" });
      })();
    });

    // Handle subscription events for metadata
    ipcMain.on(IPC_CHANNELS.WORKSPACE_METADATA_SUBSCRIBE, () => {
      try {
        const workspaceMetadata = this.config.getAllWorkspaceMetadata();

        // Emit current metadata for each workspace
        for (const metadata of workspaceMetadata) {
          this.mainWindow?.webContents.send(IPC_CHANNELS.WORKSPACE_METADATA, {
            workspaceId: metadata.id,
            metadata,
          });
        }
      } catch (error) {
        console.error("Failed to emit current metadata:", error);
      }
    });
  }

  private setupEventForwarding(): void {
    // Set up event listeners for AI service
    this.aiService.on("stream-start", (data: StreamStartEvent) => {
      if (this.mainWindow) {
        // Send the actual stream-start event
        this.mainWindow.webContents.send(getChatChannel(data.workspaceId), data);
      }
    });

    this.aiService.on("stream-delta", (data: StreamDeltaEvent) => {
      if (this.mainWindow) {
        // Send ONLY the delta event - efficient IPC usage
        this.mainWindow.webContents.send(getChatChannel(data.workspaceId), data);
      }
    });

    this.aiService.on("stream-end", (data: StreamEndEvent) => {
      if (this.mainWindow) {
        // Send the stream-end event with final content and metadata
        this.mainWindow.webContents.send(getChatChannel(data.workspaceId), data);
      }
    });

    // Forward tool events to renderer
    this.aiService.on("tool-call-start", (data: ToolCallStartEvent) => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send(getChatChannel(data.workspaceId), data);
      }
    });

    this.aiService.on("tool-call-delta", (data: ToolCallDeltaEvent) => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send(getChatChannel(data.workspaceId), data);
      }
    });

    this.aiService.on("tool-call-end", (data: ToolCallEndEvent) => {
      if (this.mainWindow) {
        this.mainWindow.webContents.send(getChatChannel(data.workspaceId), data);
      }
    });

    // Forward reasoning events to renderer
    this.aiService.on(
      "reasoning-delta",
      (data: { type: string; workspaceId: string; messageId: string; delta: string }) => {
        if (this.mainWindow) {
          this.mainWindow.webContents.send(getChatChannel(data.workspaceId), data);
        }
      }
    );

    this.aiService.on(
      "reasoning-end",
      (data: { type: string; workspaceId: string; messageId: string }) => {
        if (this.mainWindow) {
          this.mainWindow.webContents.send(getChatChannel(data.workspaceId), data);
        }
      }
    );

    this.aiService.on("error", (data: ErrorEvent) => {
      if (this.mainWindow) {
        // Send properly typed StreamErrorMessage
        const errorMessage: StreamErrorMessage = {
          type: "stream-error",
          messageId: data.messageId,
          error: data.error,
          errorType: data.errorType ?? "unknown",
        };
        this.mainWindow.webContents.send(getChatChannel(data.workspaceId), errorMessage);
      }
    });

    // Handle stream abort events
    this.aiService.on("stream-abort", (data: StreamAbortEvent) => {
      if (this.mainWindow) {
        // Forward complete abort event including metadata (usage, duration)
        this.mainWindow.webContents.send(getChatChannel(data.workspaceId), data);
      }
    });
  }

  /**
   * Check if a command is available in the system PATH
   */
  private isCommandAvailable(command: string): boolean {
    try {
      const result = spawnSync("which", [command], { encoding: "utf8" });
      return result.status === 0;
    } catch {
      return false;
    }
  }

  /**
   * Find the first available command from a list of commands
   */
  private findAvailableCommand(commands: string[]): string | null {
    return commands.find((cmd) => this.isCommandAvailable(cmd)) ?? null;
  }
}
