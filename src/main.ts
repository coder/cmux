// Enable source map support for better error stack traces in production
import "source-map-support/register";

import type { MenuItemConstructorOptions } from "electron";
import { app, BrowserWindow, ipcMain as electronIpcMain, Menu, shell, dialog } from "electron";
import * as fs from "fs";
import * as path from "path";
import type { Config } from "./config";
import type { IpcMain } from "./services/ipcMain";
import { VERSION } from "./version";
import type { loadTokenizerModules } from "./utils/main/tokenizer";

// React DevTools for development profiling
// Using require() instead of import since it's dev-only and conditionally loaded
interface Extension {
  name: string;
  id: string;
}

type ExtensionInstaller = (
  ext: { id: string },
  options?: { loadExtensionOptions?: { allowFileAccess?: boolean } }
) => Promise<Extension>;

let installExtension: ExtensionInstaller | null = null;
let REACT_DEVELOPER_TOOLS: { id: string } | null = null;

if (!app.isPackaged) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const devtools = require("electron-devtools-installer") as {
      default: ExtensionInstaller;
      REACT_DEVELOPER_TOOLS: { id: string };
    };
    installExtension = devtools.default;
    REACT_DEVELOPER_TOOLS = devtools.REACT_DEVELOPER_TOOLS;
  } catch (error) {
    console.log("React DevTools not available:", error);
  }
}

// Lazy-load Config and IpcMain to avoid loading heavy AI SDK dependencies at startup
// These will be loaded on-demand when createWindow() is called
let config: Config | null = null;
let ipcMain: IpcMain | null = null;
let loadTokenizerModulesFn: typeof loadTokenizerModules | null = null;
const isE2ETest = process.env.CMUX_E2E === "1";
const forceDistLoad = process.env.CMUX_E2E_LOAD_DIST === "1";

if (isE2ETest) {
  // For e2e tests, use a test-specific userData directory
  // Note: We can't use config.rootDir here because config isn't loaded yet
  // Instead, we'll use a hardcoded path relative to home directory
  const e2eUserData = path.join(process.env.HOME ?? "~", ".cmux", "user-data");
  try {
    fs.mkdirSync(e2eUserData, { recursive: true });
    app.setPath("userData", e2eUserData);
    console.log("Using test userData directory:", e2eUserData);
  } catch (error) {
    console.warn("Failed to prepare test userData directory:", error);
  }
}

const devServerPort = process.env.CMUX_DEVSERVER_PORT ?? "5173";

console.log(
  `Cmux starting - version: ${(VERSION as { git?: string; buildTime?: string }).git ?? "(dev)"} (built: ${(VERSION as { git?: string; buildTime?: string }).buildTime ?? "dev-mode"})`
);
console.log("Main process starting...");

// Debug: abort immediately if CMUX_DEBUG_START_TIME is set
// This is used to measure baseline startup time without full initialization
if (process.env.CMUX_DEBUG_START_TIME === "1") {
  console.log("CMUX_DEBUG_START_TIME is set - aborting immediately");
  process.exit(0);
}

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

async function createWindow() {
  // Lazy-load Config and IpcMain only when window is created
  // This defers loading heavy AI SDK dependencies until actually needed
  if (!config || !ipcMain || !loadTokenizerModulesFn) {
    /* eslint-disable no-restricted-syntax */
    // Dynamic imports are justified here for performance:
    // - IpcMain transitively imports the entire AI SDK (ai, @ai-sdk/anthropic, etc.)
    // - These are large modules that would block app startup if loaded statically
    // - Loading happens once on first window creation, then cached
    const [
      { Config: ConfigClass },
      { IpcMain: IpcMainClass },
      { loadTokenizerModules: loadTokenizerFn },
    ] = await Promise.all([
      import("./config"),
      import("./services/ipcMain"),
      import("./utils/main/tokenizer"),
    ]);
    /* eslint-enable no-restricted-syntax */
    config = new ConfigClass();
    ipcMain = new IpcMainClass(config);
    loadTokenizerModulesFn = loadTokenizerFn;
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    title: "cmux - coder multiplexer",
    // Hide menu bar on Linux by default (like VS Code)
    // User can press Alt to toggle it
    autoHideMenuBar: process.platform === "linux",
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
  if ((isE2ETest && !forceDistLoad) || (!app.isPackaged && !forceDistLoad)) {
    // Development mode: load from vite dev server
    const devHost = process.env.CMUX_DEVSERVER_HOST ?? "127.0.0.1";
    void mainWindow.loadURL(`http://${devHost}:${devServerPort}`);
    if (!isE2ETest) {
      mainWindow.webContents.once("did-finish-load", () => {
        mainWindow?.webContents.openDevTools();
      });
    }
  } else {
    // Production mode: load built files
    void mainWindow.loadFile(path.join(__dirname, "index.html"));
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
    if (!app.isPackaged && installExtension && REACT_DEVELOPER_TOOLS) {
      try {
        const extension = await installExtension(REACT_DEVELOPER_TOOLS, {
          loadExtensionOptions: { allowFileAccess: true },
        });
        console.log(`✅ React DevTools installed: ${extension.name} (id: ${extension.id})`);
      } catch (err) {
        console.log("❌ Error installing React DevTools:", err);
      }
    }

    createMenu();
    await createWindow();

    // Start loading tokenizer modules in background after window is created
    // This ensures accurate token counts for first API calls (especially in e2e tests)
    // Loading happens asynchronously and won't block the UI
    if (loadTokenizerModulesFn) {
      void loadTokenizerModulesFn().then(() => {
        console.log("Tokenizer modules loaded");
      });
    }
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
      void createWindow();
    }
  });
}
