import { app, BrowserWindow, ipcMain, dialog, Menu, MenuItemConstructorOptions } from "electron";
import * as path from "path";
import { load_config_or_default, save_config, Config, ProjectConfig } from "./config";
import { createWorktree, removeWorktree } from "./git";
import { AIService } from "./services/aiService";
import { createCmuxMessage } from "./types/message";
import type {
  StreamStartEvent,
  StreamDeltaEvent,
  StreamEndEvent,
  ErrorEvent,
} from "./types/aiEvents";
import { IPC_CHANNELS, getOutputChannel } from "./constants/ipc-constants.js";

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
      await aiService.saveWorkspaceMetadata(workspaceId, {
        id: workspaceId,
        projectName,
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
  // For now, return empty list - would need to scan all workspace directories
  return [];
});

ipcMain.handle(IPC_CHANNELS.WORKSPACE_GET_INFO, async (_event, workspaceId: string) => {
  const result = await aiService.getWorkspaceMetadata(workspaceId);
  return result.success ? result.data : null;
});

// Permission mode no longer supported - removed

ipcMain.handle(IPC_CHANNELS.WORKSPACE_SEND_MESSAGE, async () => {
  // For simple implementation, just echo back success
  return { success: true };
});

ipcMain.handle(IPC_CHANNELS.WORKSPACE_CLEAR_HISTORY, async (_event, workspaceId: string) => {
  return await aiService.clearHistory(workspaceId);
});

ipcMain.handle(IPC_CHANNELS.WORKSPACE_STREAM_HISTORY, async (_event, workspaceId: string) => {
  // Stream history to renderer
  const history = await aiService.getHistory(workspaceId);
  if (history.success) {
    history.data.forEach((msg) => {
      const channel = getOutputChannel(workspaceId);
      // Send the CmuxMessage directly
      mainWindow?.webContents.send(channel, msg);
    });
  }
  // Send caught-up message with proper type
  mainWindow?.webContents.send(getOutputChannel(workspaceId), { type: "caught-up" });
});

ipcMain.handle(IPC_CHANNELS.WORKSPACE_STREAM_META, async () => {
  // Stream metadata for all workspaces - simplified version
  return;
});

// Set up event listeners for AI service
aiService.on("stream-start", (data: StreamStartEvent) => {
  if (mainWindow) {
    // Create a streaming CmuxMessage
    const msg = createCmuxMessage(data.messageId, "assistant", "", {
      streamingId: data.messageId,
      sequenceNumber: 0,
    });
    // Update the message state to streaming
    msg.parts[0] = { type: "text", text: "", state: "streaming" };
    mainWindow.webContents.send(getOutputChannel(data.workspaceId), msg);
  }
});

aiService.on("stream-delta", (data: StreamDeltaEvent) => {
  if (mainWindow) {
    // Send delta as a streaming CmuxMessage
    const msg = createCmuxMessage(data.messageId, "assistant", data.delta || "", {
      streamingId: data.messageId,
      sequenceNumber: 0,
    });
    msg.parts[0] = { type: "text", text: data.delta || "", state: "streaming" };
    mainWindow.webContents.send(getOutputChannel(data.workspaceId), msg);
  }
});

aiService.on("stream-end", (data: StreamEndEvent) => {
  if (mainWindow) {
    // Send final complete message
    const msg = createCmuxMessage(data.messageId, "assistant", data.content || "", {
      sequenceNumber: 0,
      tokens: data.usage?.totalTokens,
    });
    mainWindow.webContents.send(getOutputChannel(data.workspaceId), msg);
  }
});

aiService.on("error", (data: ErrorEvent) => {
  if (mainWindow) {
    mainWindow.webContents.send(getOutputChannel(data.workspaceId), { error: data.error });
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
