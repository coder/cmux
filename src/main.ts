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

ipcMain.handle(
  "git:createWorktree",
  async (event, projectPath: string, branchName: string) => {
    return await createWorktree(projectPath, branchName);
  }
);

ipcMain.handle("git:removeWorktree", async (event, workspacePath: string) => {
  return await removeWorktree(workspacePath);
});

// Claude Code management handlers using SDK
ipcMain.handle(
  "claude:start",
  async (event, srcPath: string, projectName: string, branch: string) => {
    return await claudeService.startWorkspace(
      srcPath,  // Git worktree path
      projectName,
      branch
    );
  }
);

ipcMain.handle(
  "claude:isActive",
  async (event, projectName: string, branch: string) => {
    return claudeService.isWorkspaceActive(projectName, branch);
  }
);

ipcMain.handle(
  "claude:getOutput",
  async (event, projectName: string, branch: string) => {
    return claudeService.getWorkspaceOutput(projectName, branch);
  }
);

ipcMain.handle("claude:list", async () => {
  return claudeService.list();
});

ipcMain.handle(
  "claude:getWorkspaceInfo",
  async (event, projectName: string, branch: string) => {
    return await claudeService.getWorkspaceInfo(projectName, branch);
  }
);

ipcMain.handle(
  "claude:setPermissionMode",
  async (event, projectName: string, branch: string, permissionMode: import('./types/global').UIPermissionMode) => {
    return await claudeService.setPermissionMode(projectName, branch, permissionMode);
  }
);

ipcMain.handle(
  "claude:sendMessage",
  async (event, projectName: string, branch: string, message: string) => {
    return await claudeService.sendMessage(projectName, branch, message);
  }
);

ipcMain.handle(
  "claude:handleSlashCommand",
  async (event, projectName: string, branch: string, command: string) => {
    return await claudeService.handleSlashCommand(projectName, branch, command);
  }
);

// Listen for output events and forward to renderer
claudeService.on("output", (data) => {
  if (mainWindow) {
    mainWindow.webContents.send("claude:output", data);
  }
});

// Listen for clear events and forward to renderer
claudeService.on("clear", (data) => {
  if (mainWindow) {
    mainWindow.webContents.send("claude:clear", data);
  }
});

// Listen for compaction-complete events and forward to renderer
claudeService.on("compaction-complete", (data) => {
  if (mainWindow) {
    mainWindow.webContents.send("claude:compaction-complete", data);
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

    // Auto-start all workspaces after window is ready
    try {
      console.log("Auto-starting workspaces...");
      const config = load_config_or_default();
      await claudeService.autoStartAllWorkspaces(config.projects);
      console.log("Workspaces auto-start complete");
    } catch (error) {
      console.error("Failed to auto-start workspaces:", error);
    }
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
