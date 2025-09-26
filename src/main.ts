import { app, BrowserWindow, ipcMain, dialog, Menu } from "electron";
import * as path from "path";
import { load_config_or_default, save_config, Config } from "./config";
import { createWorktree, removeWorktree } from "./git";
import claudeService from "./services/claudeService";

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
  app.on("second-instance", (event, commandLine, workingDirectory) => {
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
ipcMain.handle("config:load", async () => {
  const config = load_config_or_default();
  return {
    projects: Array.from(config.projects.entries()),
  };
});

ipcMain.handle("config:save", async (event, configData: any) => {
  const config: Config = {
    projects: new Map(configData.projects),
  };
  save_config(config);
  return true;
});

ipcMain.handle("dialog:selectDirectory", async () => {
  if (!mainWindow) return null;

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });

  if (result.canceled) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("git:createWorktree", async (event, projectPath: string, branchName: string) => {
  const result = await createWorktree(projectPath, branchName);

  // If worktree creation was successful, initialize the workspace metadata
  if (result.success && result.path) {
    const projectName = projectPath.split("/").pop() || projectPath.split("\\").pop() || "unknown";
    const workspaceId = `${projectName}-${branchName}`;
    await claudeService.initializeWorkspace(workspaceId, projectName, branchName, result.path);
  }

  return result;
});

ipcMain.handle("git:removeWorktree", async (event, workspacePath: string) => {
  return await removeWorktree(workspacePath);
});

ipcMain.handle("claude:removeWorkspace", async (event, workspaceId: string) => {
  return await claudeService.removeWorkspace(workspaceId);
});

// Claude Code management handlers using SDK
// Note: Workspaces are now started automatically on demand when sending messages
// No need for explicit start or isActive handlers

ipcMain.handle("claude:list", async () => {
  return claudeService.list();
});

ipcMain.handle("claude:getWorkspaceInfo", async (event, workspaceId: string) => {
  return await claudeService.getWorkspaceInfoById(workspaceId);
});

ipcMain.handle(
  "claude:setPermissionMode",
  async (event, workspaceId: string, permissionMode: import("./types/global").UIPermissionMode) => {
    return await claudeService.setPermissionModeById(workspaceId, permissionMode);
  }
);

ipcMain.handle("claude:sendMessage", async (event, workspaceId: string, message: string) => {
  return await claudeService.sendMessageById(workspaceId, message);
});

ipcMain.handle("claude:handleSlashCommand", async (event, workspaceId: string, command: string) => {
  return await claudeService.handleSlashCommandById(workspaceId, command);
});

ipcMain.handle("claude:streamHistory", async (event, workspaceId: string) => {
  return await claudeService.streamWorkspaceHistoryById(workspaceId);
});

// Listen for workspace-specific output events and forward to renderer
// The EventEmitter doesn't support wildcard listeners, so we'll modify claudeService
// to emit a generic 'workspace-output' event with the workspace ID
claudeService.on("workspace-output", (workspaceId: string, data: any) => {
  if (mainWindow) {
    mainWindow.webContents.send(`claude:output:${workspaceId}`, data);
  }
});

// Listen for workspace-specific clear events and forward to renderer
claudeService.on("workspace-clear", (workspaceId: string, data: any) => {
  if (mainWindow) {
    mainWindow.webContents.send(`claude:clear:${workspaceId}`, data);
  }
});

function createMenu() {
  const template: any[] = [
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
