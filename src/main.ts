import type { MenuItemConstructorOptions } from "electron";
import { app, BrowserWindow, ipcMain, dialog, Menu } from "electron";
import * as path from "path";
import type { ProjectConfig, ProjectsConfig } from "./config";
import { Config } from "./config";
import { createWorktree, removeWorktree } from "./git";
import { AIService } from "./services/aiService";
import { HistoryService } from "./services/historyService";
import { PartialService } from "./services/partialService";
import { createCmuxMessage } from "./types/message";
import { log } from "./services/log";
import type {
  StreamStartEvent,
  StreamDeltaEvent,
  StreamEndEvent,
  ErrorEvent,
  ToolCallStartEvent,
  ToolCallDeltaEvent,
  ToolCallEndEvent,
} from "./types/stream";
import { IPC_CHANNELS, getChatChannel } from "./constants/ipc-constants";
import type { SendMessageError } from "./types/errors";
import type { StreamErrorMessage, SendMessageOptions } from "./types/ipc";

const config = new Config();
const historyService = new HistoryService(config);
const partialService = new PartialService(config, historyService);
const aiService = new AIService(config, historyService, partialService);

console.log("Main process starting...");

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
console.log("Single instance lock acquired:", gotTheLock);

if (!gotTheLock) {
  // Another instance is already running, quit this one
  console.log("Another instance is already running, quitting...");
  app.quit();
} else {
  // This is the primary instance
  console.log("This is the primary instance");
  app.on("second-instance", () => {
    // Someone tried to run a second instance, focus our window instead
    console.log("Second instance attempted to start");
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow: BrowserWindow | null = null;

const createUnknownSendMessageError = (raw: string): SendMessageError => ({
  type: "unknown",
  raw,
});

// Register IPC handlers before creating window
ipcMain.handle(IPC_CHANNELS.CONFIG_LOAD, () => {
  const projectsConfig = config.loadConfigOrDefault();
  return {
    projects: Array.from(projectsConfig.projects.entries()),
  };
});

ipcMain.handle(
  IPC_CHANNELS.CONFIG_SAVE,
  (_event, configData: { projects: Array<[string, ProjectConfig]> }) => {
    const projectsConfig: ProjectsConfig = {
      projects: new Map(configData.projects),
    };
    config.saveConfig(projectsConfig);
    return true;
  }
);

ipcMain.handle(IPC_CHANNELS.DIALOG_SELECT_DIR, async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0];
});

// Workspace handlers
ipcMain.handle(
  IPC_CHANNELS.WORKSPACE_CREATE,
  async (_event, projectPath: string, branchName: string) => {
    // First create the git worktree
    const result = await createWorktree(config, projectPath, branchName);

    if (result.success && result.path) {
      const projectName =
        projectPath.split("/").pop() ?? projectPath.split("\\").pop() ?? "unknown";
      const workspaceId = `${projectName}-${branchName}`;

      // Initialize the workspace metadata
      // Initialize workspace metadata
      const metadata = {
        id: workspaceId,
        projectName,
        workspacePath: result.path,
      };
      await aiService.saveWorkspaceMetadata(workspaceId, metadata);

      // Emit metadata event for new workspace
      mainWindow?.webContents.send(IPC_CHANNELS.WORKSPACE_METADATA, {
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
    const projectsConfig = config.loadConfigOrDefault();

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
    const aiResult = await aiService.deleteWorkspace(workspaceId);
    if (!aiResult.success) {
      return { success: false, error: aiResult.error };
    }

    // Update config to remove the workspace
    if (foundProjectPath && workspacePath) {
      const projectConfig = projectsConfig.projects.get(foundProjectPath);
      if (projectConfig) {
        projectConfig.workspaces = projectConfig.workspaces.filter((w) => w.path !== workspacePath);
        config.saveConfig(projectsConfig);
      }
    }

    // Emit metadata event for workspace removal (with null metadata to indicate deletion)
    mainWindow?.webContents.send(IPC_CHANNELS.WORKSPACE_METADATA, {
      workspaceId,
      metadata: null, // null indicates workspace was deleted
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: `Failed to remove workspace: ${message}` };
  }
});

// Claude Code management handlers using SDK
// Note: Workspaces are now started automatically on demand when sending messages
// No need for explicit start or isActive handlers

ipcMain.handle(IPC_CHANNELS.WORKSPACE_LIST, async () => {
  try {
    const workspaceData = await config.getAllWorkspaceMetadata();
    return workspaceData.map(({ metadata }) => metadata);
  } catch (error) {
    console.error("Failed to list workspaces:", error);
    return [];
  }
});

ipcMain.handle(IPC_CHANNELS.WORKSPACE_GET_INFO, async (_event, workspaceId: string) => {
  const result = await aiService.getWorkspaceMetadata(workspaceId);
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
        if (aiService.isStreaming(workspaceId)) {
          log.debug("sendMessage handler: Empty message during streaming, interrupting");
          const stopResult = await aiService.stopStream(workspaceId);
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
        const truncateResult = await historyService.truncateAfterMessage(
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
      const appendResult = await historyService.appendToHistory(workspaceId, userMessage);
      if (!appendResult.success) {
        log.error("Failed to append message to history:", appendResult.error);
        return {
          success: false,
          error: createUnknownSendMessageError(appendResult.error),
        };
      }

      // Broadcast the user message immediately to the frontend
      if (mainWindow) {
        mainWindow.webContents.send(getChatChannel(workspaceId), userMessage);
      }

      // Commit any existing partial to history BEFORE loading
      // This ensures interrupted messages are included in the AI's context
      await partialService.commitToHistory(workspaceId);

      // Get full conversation history
      const historyResult = await historyService.getHistory(workspaceId);
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
      const streamResult = await aiService.streamMessage(
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
  return await historyService.clearHistory(workspaceId);
});

// Provider configuration handlers
ipcMain.handle(
  IPC_CHANNELS.PROVIDERS_SET_CONFIG,
  (_event, provider: string, keyPath: string[], value: string) => {
    try {
      // Load current providers config or create empty
      const providersConfig = config.loadProvidersConfig() ?? {};

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
      config.saveProvidersConfig(providersConfig);

      return { success: true, data: undefined };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Failed to set provider config: ${message}` };
    }
  }
);

ipcMain.handle(IPC_CHANNELS.PROVIDERS_LIST, () => {
  try {
    const providersConfig = config.loadProvidersConfig() ?? {};
    return Object.keys(providersConfig);
  } catch (error) {
    log.error("Failed to list providers config:", error);
    return [];
  }
});

// Handle subscription events for chat history
ipcMain.on(`workspace:chat:subscribe`, (_event, workspaceId: string) => {
  void (async () => {
    const chatChannel = getChatChannel(workspaceId);

    const history = await historyService.getHistory(workspaceId);
    if (history.success) {
      for (const msg of history.data) {
        mainWindow?.webContents.send(chatChannel, msg);
      }

      const partial = await partialService.readPartial(workspaceId);
      if (partial) {
        mainWindow?.webContents.send(chatChannel, partial);
      }
    }

    mainWindow?.webContents.send(chatChannel, { type: "caught-up" });
  })();
});

// Handle subscription events for metadata
ipcMain.on(
  `workspace:metadata:subscribe`,
  () =>
    void (async () => {
      try {
        const workspaceData = await config.getAllWorkspaceMetadata();

        // Emit current metadata for each workspace
        for (const { workspaceId, metadata } of workspaceData) {
          mainWindow?.webContents.send(IPC_CHANNELS.WORKSPACE_METADATA, {
            workspaceId,
            metadata,
          });
        }
      } catch (error) {
        console.error("Failed to emit current metadata:", error);
      }
    })()
);

// Set up event listeners for AI service
aiService.on("stream-start", (data: StreamStartEvent) => {
  if (mainWindow) {
    // Send the actual stream-start event
    mainWindow.webContents.send(getChatChannel(data.workspaceId), data);
  }
});

aiService.on("stream-delta", (data: StreamDeltaEvent) => {
  if (mainWindow) {
    // Send ONLY the delta event - efficient IPC usage
    mainWindow.webContents.send(getChatChannel(data.workspaceId), data);
  }
});

aiService.on("stream-end", (data: StreamEndEvent) => {
  if (mainWindow) {
    // Send the stream-end event with final content and metadata
    mainWindow.webContents.send(getChatChannel(data.workspaceId), data);
  }
});

// Forward tool events to renderer
aiService.on("tool-call-start", (data: ToolCallStartEvent) => {
  if (mainWindow) {
    mainWindow.webContents.send(getChatChannel(data.workspaceId), data);
  }
});

aiService.on("tool-call-delta", (data: ToolCallDeltaEvent) => {
  if (mainWindow) {
    mainWindow.webContents.send(getChatChannel(data.workspaceId), data);
  }
});

aiService.on("tool-call-end", (data: ToolCallEndEvent) => {
  if (mainWindow) {
    mainWindow.webContents.send(getChatChannel(data.workspaceId), data);
  }
});

// Forward reasoning events to renderer
aiService.on(
  "reasoning-delta",
  (data: { type: string; workspaceId: string; messageId: string; delta: string }) => {
    if (mainWindow) {
      mainWindow.webContents.send(getChatChannel(data.workspaceId), data);
    }
  }
);

aiService.on("reasoning-end", (data: { type: string; workspaceId: string; messageId: string }) => {
  if (mainWindow) {
    mainWindow.webContents.send(getChatChannel(data.workspaceId), data);
  }
});

aiService.on("error", (data: ErrorEvent) => {
  if (mainWindow) {
    // Send properly typed StreamErrorMessage
    const errorMessage: StreamErrorMessage = {
      type: "stream-error",
      error: data.error,
      errorType: data.errorType ?? "unknown",
    };
    mainWindow.webContents.send(getChatChannel(data.workspaceId), errorMessage);
  }
});

// Handle stream abort events
aiService.on("stream-abort", (data: { type: string; workspaceId: string; messageId?: string }) => {
  if (mainWindow) {
    // Send the stream-abort event to frontend
    mainWindow.webContents.send(getChatChannel(data.workspaceId), {
      type: "stream-abort",
      workspaceId: data.workspaceId,
      messageId: data.messageId,
    });
  }
});

function createMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
  ];

  if (process.platform === "darwin") {
    template.unshift({
      label: app.getName(),
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services", submenu: [] },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    title: "cmux - coder multiplexer",
  });

  // Always load from dev server for now
  void mainWindow.loadURL("http://localhost:5173");

  // Open DevTools in development
  if (process.env.NODE_ENV !== "production") {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Only setup app handlers if we got the lock
if (gotTheLock) {
  void app.whenReady().then(() => {
    console.log("App ready, creating window...");
    createMenu();
    createWindow();
    // No need to auto-start workspaces anymore - they start on demand
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("activate", () => {
    if (mainWindow === null) {
      createWindow();
    }
  });
}
