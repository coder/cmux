import { app, BrowserWindow, ipcMain, dialog, Menu, MenuItemConstructorOptions } from "electron";
import * as path from "path";
import {
  load_config_or_default,
  save_config,
  Config,
  ProjectConfig,
  getAllWorkspaceMetadata,
  loadProvidersConfig,
  saveProvidersConfig,
  ProvidersConfig,
} from "./config";
import { createWorktree, removeWorktree } from "./git";
import { AIService } from "./services/aiService";
import { createCmuxMessage } from "./types/message";
import type {
  StreamStartEvent,
  StreamDeltaEvent,
  StreamEndEvent,
  ErrorEvent,
} from "./types/aiEvents";
import { IPC_CHANNELS, getChatChannel } from "./constants/ipc-constants";
import type { SendMessageError } from "./types/errors";
import type { StreamErrorMessage } from "./types/ipc";

const aiService = new AIService();

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

// Register IPC handlers before creating window
ipcMain.handle(IPC_CHANNELS.CONFIG_LOAD, async () => {
  const config = load_config_or_default();
  return {
    projects: Array.from(config.projects.entries()),
  };
});

ipcMain.handle(
  IPC_CHANNELS.CONFIG_SAVE,
  async (_event, configData: { projects: Array<[string, ProjectConfig]> }) => {
    const config: Config = {
      projects: new Map(configData.projects),
    };
    save_config(config);
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
    const result = await createWorktree(projectPath, branchName);

    if (result.success && result.path) {
      const projectName =
        projectPath.split("/").pop() || projectPath.split("\\").pop() || "unknown";
      const workspaceId = `${projectName}-${branchName}`;

      // Initialize the workspace metadata
      // Initialize workspace metadata
      const metadata = {
        id: workspaceId,
        projectName,
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
    const config = load_config_or_default();

    // Find workspace path from config
    let workspacePath: string | null = null;
    let foundProjectPath: string | null = null;

    for (const [projectPath, projectConfig] of config.projects.entries()) {
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
      const projectConfig = config.projects.get(foundProjectPath);
      if (projectConfig) {
        projectConfig.workspaces = projectConfig.workspaces.filter((w) => w.path !== workspacePath);
        save_config(config);
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
    const workspaceData = await getAllWorkspaceMetadata();
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
  async (_event, workspaceId: string, message: string) => {
    try {
      // Create user message
      const messageId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const userMessage = createCmuxMessage(messageId, "user", message, {
        sequenceNumber: 0, // Will be properly set by aiService
        timestamp: Date.now(),
      });

      // Append user message to history
      const appendResult = await aiService.appendToHistory(workspaceId, userMessage);
      if (!appendResult.success) {
        return appendResult; // Return the error
      }

      // Broadcast the user message immediately to the frontend
      if (mainWindow) {
        mainWindow.webContents.send(getChatChannel(workspaceId), userMessage);
      }

      // Get full conversation history
      const historyResult = await aiService.getHistory(workspaceId);
      if (!historyResult.success) {
        return historyResult; // Return the error
      }

      // Stream the AI response
      const streamResult = await aiService.streamMessage(historyResult.data, workspaceId);
      return streamResult;
    } catch (error) {
      // Convert to SendMessageError for typed error handling
      const errorMessage = error instanceof Error ? error.message : String(error);
      const sendError: SendMessageError = {
        type: "unknown",
        raw: `Failed to send message: ${errorMessage}`,
      };
      return { success: false, error: sendError };
    }
  }
);

ipcMain.handle(IPC_CHANNELS.WORKSPACE_CLEAR_HISTORY, async (_event, workspaceId: string) => {
  return await aiService.clearHistory(workspaceId);
});

// Provider configuration handlers
ipcMain.handle(
  IPC_CHANNELS.PROVIDERS_SET_CONFIG,
  async (_event, provider: string, keyPath: string[], value: string) => {
    try {
      // Load current providers config or create empty
      const config = loadProvidersConfig() || {};

      // Ensure provider exists
      if (!config[provider]) {
        config[provider] = {};
      }

      // Set nested property value
      let current = config[provider] as Record<string, unknown>;
      for (let i = 0; i < keyPath.length - 1; i++) {
        const key = keyPath[i];
        if (!(key in current) || typeof current[key] !== "object" || current[key] === null) {
          current[key] = {};
        }
        current = current[key] as Record<string, unknown>;
      }

      // Set the final value
      if (keyPath.length > 0) {
        current[keyPath[keyPath.length - 1]] = value;
      }

      // Save updated config
      saveProvidersConfig(config as ProvidersConfig);

      return { success: true, data: undefined };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Failed to set provider config: ${message}` };
    }
  }
);

// Handle subscription events for chat history
ipcMain.on(`workspace:chat:subscribe`, async (_event, workspaceId: string) => {
  const chatChannel = getChatChannel(workspaceId);

  // Emit current chat history immediately
  const history = await aiService.getHistory(workspaceId);
  if (history.success) {
    history.data.forEach((msg) => {
      mainWindow?.webContents.send(chatChannel, msg);
    });
  }

  // Send caught-up signal
  mainWindow?.webContents.send(chatChannel, { type: "caught-up" });
});

// Handle subscription events for metadata
ipcMain.on(`workspace:metadata:subscribe`, async () => {
  try {
    const workspaceData = await getAllWorkspaceMetadata();

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
});

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

aiService.on("error", (data: ErrorEvent) => {
  if (mainWindow) {
    // Send properly typed StreamErrorMessage
    const errorMessage: StreamErrorMessage = {
      type: "stream-error",
      error: data.error,
      errorType: data.errorType || "unknown",
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
  mainWindow.loadURL("http://localhost:5173");

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
  app.whenReady().then(async () => {
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
