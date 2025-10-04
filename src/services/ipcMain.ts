import type { BrowserWindow, IpcMain as ElectronIpcMain } from "electron";
import * as path from "path";
import type { Config, ProjectConfig } from "../config";
import { createWorktree, removeWorktree } from "../git";
import { AIService } from "../services/aiService";
import { HistoryService } from "../services/historyService";
import { PartialService } from "../services/partialService";
import { createCmuxMessage } from "../types/message";
import { log } from "../services/log";
import type {
  StreamStartEvent,
  StreamDeltaEvent,
  StreamEndEvent,
  ToolCallStartEvent,
  ToolCallDeltaEvent,
  ToolCallEndEvent,
  ErrorEvent,
} from "../types/stream";
import { IPC_CHANNELS, getChatChannel } from "../constants/ipc-constants";
import type { SendMessageError } from "../types/errors";
import type { StreamErrorMessage, SendMessageOptions } from "../types/ipc";

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
    this.mainWindow = mainWindow;
    this.registerConfigHandlers(ipcMain);
    this.registerDialogHandlers(ipcMain);
    this.registerWorkspaceHandlers(ipcMain);
    this.registerProviderHandlers(ipcMain);
    this.registerSubscriptionHandlers(ipcMain);
    this.setupEventForwarding();
  }

  private registerConfigHandlers(ipcMain: ElectronIpcMain): void {
    ipcMain.handle(IPC_CHANNELS.CONFIG_LOAD, () => {
      const projectsConfig = this.config.loadConfigOrDefault();
      return {
        projects: Array.from(projectsConfig.projects.entries()),
      };
    });

    ipcMain.handle(
      IPC_CHANNELS.CONFIG_SAVE,
      (_event, configData: { projects: Array<[string, ProjectConfig]> }) => {
        const projectsConfig = {
          projects: new Map(configData.projects),
        };
        this.config.saveConfig(projectsConfig);
        return true;
      }
    );
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

  private registerWorkspaceHandlers(ipcMain: ElectronIpcMain): void {
    ipcMain.handle(
      IPC_CHANNELS.WORKSPACE_CREATE,
      async (_event, projectPath: string, branchName: string) => {
        // First create the git worktree
        const result = await createWorktree(this.config, projectPath, branchName);

        if (result.success && result.path) {
          const projectName =
            projectPath.split("/").pop() ?? projectPath.split("\\").pop() ?? "unknown";
          const workspaceId = `${projectName}-${branchName}`;

          // Initialize workspace metadata
          const metadata = {
            id: workspaceId,
            projectName,
            workspacePath: result.path,
          };
          await this.aiService.saveWorkspaceMetadata(workspaceId, metadata);

          // Emit metadata event for new workspace
          this.mainWindow?.webContents.send(IPC_CHANNELS.WORKSPACE_METADATA, {
            workspaceId,
            metadata,
          });

          return { success: true, workspaceId, path: result.path };
        }

        return result;
      }
    );

    ipcMain.handle(IPC_CHANNELS.WORKSPACE_REMOVE, async (_event, workspaceId: string) => {
      try {
        // Load current config
        const projectsConfig = this.config.loadConfigOrDefault();

        // Find workspace path from config
        let workspacePath: string | null = null;
        let foundProjectPath: string | null = null;

        for (const [projectPath, projectConfig] of projectsConfig.projects.entries()) {
          const workspace = projectConfig.workspaces.find((w) => {
            const projectName = path.basename(projectPath);
            const wsId = `${projectName}-${w.branch}`;
            return wsId === workspaceId;
          });

          if (workspace) {
            workspacePath = workspace.path;
            foundProjectPath = projectPath;
            break;
          }
        }

        // Remove git worktree if we found the path
        if (workspacePath) {
          const gitResult = await removeWorktree(workspacePath, { force: false });
          if (!gitResult.success) {
            return gitResult;
          }
        }

        // Remove the workspace from AI service
        const aiResult = await this.aiService.deleteWorkspace(workspaceId);
        if (!aiResult.success) {
          return { success: false, error: aiResult.error };
        }

        // Update config to remove the workspace
        if (foundProjectPath && workspacePath) {
          const projectConfig = projectsConfig.projects.get(foundProjectPath);
          if (projectConfig) {
            projectConfig.workspaces = projectConfig.workspaces.filter(
              (w) => w.path !== workspacePath
            );
            this.config.saveConfig(projectsConfig);
          }
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
    });

    ipcMain.handle(IPC_CHANNELS.WORKSPACE_LIST, async () => {
      try {
        const workspaceData = await this.config.getAllWorkspaceMetadata();
        return workspaceData.map(({ metadata }) => metadata);
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
      async (_event, workspaceId: string, message: string, options?: SendMessageOptions) => {
        const { editMessageId, thinkingLevel, model } = options ?? {};
        log.debug("sendMessage handler: Received", {
          workspaceId,
          messagePreview: message.substring(0, 50),
          editMessageId,
          thinkingLevel,
          model,
        });
        try {
          // Early exit: empty message = either interrupt (if streaming) or invalid input
          // This prevents race conditions where empty messages arrive after streaming stops
          if (!message.trim()) {
            // If streaming, this is an interrupt request (from Esc key)
            if (this.aiService.isStreaming(workspaceId)) {
              log.debug("sendMessage handler: Empty message during streaming, interrupting");
              const stopResult = await this.aiService.stopStream(workspaceId);
              if (!stopResult.success) {
                log.error("Failed to stop stream:", stopResult.error);
                return {
                  success: false,
                  error: createUnknownSendMessageError(stopResult.error),
                };
              }
              return { success: true };
            }

            // If not streaming, reject empty message to prevent creating empty user messages
            log.debug("sendMessage handler: Rejected empty message (not streaming)");
            return { success: true }; // Return success to avoid error notification in UI
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

          // Create user message
          const messageId = `user-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
          const userMessage = createCmuxMessage(messageId, "user", message, {
            // historySequence will be assigned by historyService.appendToHistory()
            timestamp: Date.now(),
          });

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
          if (!model) {
            log.error("No model provided by frontend");
            return {
              success: false,
              error: createUnknownSendMessageError(
                "No model specified. Please select a model using /model command."
              ),
            };
          }
          log.debug("sendMessage handler: Calling aiService.streamMessage with thinkingLevel", {
            thinkingLevel,
            model,
          });
          const streamResult = await this.aiService.streamMessage(
            historyResult.data,
            workspaceId,
            model,
            thinkingLevel,
            undefined
          );
          log.debug("sendMessage handler: Stream completed");
          return streamResult;
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

    ipcMain.handle(IPC_CHANNELS.WORKSPACE_CLEAR_HISTORY, async (_event, workspaceId: string) => {
      // Clear both chat.jsonl and partial.json
      const historyResult = await this.historyService.clearHistory(workspaceId);
      if (!historyResult.success) {
        return historyResult;
      }
      return await this.partialService.deletePartial(workspaceId);
    });
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

          const partial = await this.partialService.readPartial(workspaceId);
          if (partial) {
            this.mainWindow?.webContents.send(chatChannel, partial);
          }
        }

        this.mainWindow?.webContents.send(chatChannel, { type: "caught-up" });
      })();
    });

    // Handle subscription events for metadata
    ipcMain.on(
      `workspace:metadata:subscribe`,
      () =>
        void (async () => {
          try {
            const workspaceData = await this.config.getAllWorkspaceMetadata();

            // Emit current metadata for each workspace
            for (const { workspaceId, metadata } of workspaceData) {
              this.mainWindow?.webContents.send(IPC_CHANNELS.WORKSPACE_METADATA, {
                workspaceId,
                metadata,
              });
            }
          } catch (error) {
            console.error("Failed to emit current metadata:", error);
          }
        })()
    );
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
    this.aiService.on(
      "stream-abort",
      (data: { type: string; workspaceId: string; messageId?: string }) => {
        if (this.mainWindow) {
          // Send the stream-abort event to frontend
          this.mainWindow.webContents.send(getChatChannel(data.workspaceId), {
            type: "stream-abort",
            workspaceId: data.workspaceId,
            messageId: data.messageId,
          });
        }
      }
    );
  }
}
