// Enable source map support for better error stack traces in production
import "source-map-support/register";

import type { MenuItemConstructorOptions } from "electron";
import { app, BrowserWindow, ipcMain as electronIpcMain, Menu, shell, dialog } from "electron";
import * as path from "path";
import { Config } from "./config";
import { IpcMain } from "./services/ipcMain";
import { VERSION } from "./version";

const config = new Config();
const ipcMain = new IpcMain(config);

console.log(`Cmux starting - version: ${VERSION.git} (built: ${VERSION.buildTime})`);
console.log("Main process starting...");

// Global error handlers for better error reporting
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  console.error("Stack:", error.stack);

  // Show error dialog in production
  if (app.isPackaged) {
    dialog.showErrorBox(
      "Application Error",
      `An unexpected error occurred:\n\n${error.message}\n\nStack trace:\n${error.stack ?? "No stack trace available"}`
    );
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise);
  console.error("Reason:", reason);

  if (app.isPackaged) {
    const message = reason instanceof Error ? reason.message : String(reason);
    const stack = reason instanceof Error ? reason.stack : undefined;
    dialog.showErrorBox(
      "Unhandled Promise Rejection",
      `An unhandled promise rejection occurred:\n\n${message}\n\nStack trace:\n${stack ?? "No stack trace available"}`
    );
  }
});

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

  // Register IPC handlers with the main window
  ipcMain.register(electronIpcMain, mainWindow);

  // Open all external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const currentOrigin = new URL(mainWindow!.webContents.getURL()).origin;
    const targetOrigin = new URL(url).origin;
    // Prevent navigation away from app origin, open externally instead
    if (targetOrigin !== currentOrigin) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  // Load from dev server in development, built files in production
  // app.isPackaged is true when running from a built .app/.exe, false in development
  if (app.isPackaged) {
    // Production mode: load built files
    void mainWindow.loadFile(path.join(__dirname, "index.html"));
  } else {
    // Development mode: load from vite dev server
    void mainWindow.loadURL("http://localhost:5173");
    // Open DevTools after React content loads
    mainWindow.webContents.once('did-finish-load', () => {
      mainWindow?.webContents.openDevTools();
    });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// Only setup app handlers if we got the lock
if (gotTheLock) {
  void app.whenReady().then(async () => {
    console.log("App ready, creating window...");
    
    // Install React DevTools in development
    if (!app.isPackaged) {
      try {
        const { default: installExtension, REACT_DEVELOPER_TOOLS } = await import(
          "electron-devtools-installer"
        );
        const extension = await installExtension(REACT_DEVELOPER_TOOLS, {
          loadExtensionOptions: { allowFileAccess: true },
        });
        console.log(`✅ React DevTools installed: ${extension.name} (id: ${extension.id})`);
      } catch (error) {
        console.log("❌ Error installing React DevTools:", error);
      }
    }
    
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
    // Only create window if app is ready and no window exists
    // This prevents "Cannot create BrowserWindow before app is ready" error
    if (app.isReady() && mainWindow === null) {
      createWindow();
    }
  });
}
