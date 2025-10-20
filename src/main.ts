// Enable source map support for better error stack traces in production
import "source-map-support/register";
import "disposablestack/auto";

import type { MenuItemConstructorOptions } from "electron";
import {
  app,
  BrowserWindow,
  ipcMain as electronIpcMain,
  Menu,
  shell,
  dialog,
  screen,
} from "electron";
import * as fs from "fs";
import * as path from "path";
import type { Config } from "./config";
import type { IpcMain } from "./services/ipcMain";
import { VERSION } from "./version";
import type { loadTokenizerModules } from "./utils/main/tokenizer";
import { IPC_CHANNELS } from "./constants/ipc-constants";

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

// IMPORTANT: Lazy-load heavy dependencies to maintain fast startup time
//
// To keep startup time under 4s, avoid importing AI SDK packages at the top level.
// These files MUST use dynamic import():
//   - main.ts, config.ts, preload.ts (startup-critical)
//
// ✅ GOOD: const { createAnthropic } = await import("@ai-sdk/anthropic");
// ❌ BAD:  import { createAnthropic } from "@ai-sdk/anthropic";
//
// Enforcement: scripts/check_eager_imports.sh validates this in CI
//
// Lazy-load Config and IpcMain to avoid loading heavy AI SDK dependencies at startup
// These will be loaded on-demand when createWindow() is called
let config: Config | null = null;
let ipcMain: IpcMain | null = null;
let loadTokenizerModulesFn: typeof loadTokenizerModules | null = null;
let updaterService: typeof import("./services/updater").UpdaterService.prototype | null = null;
const isE2ETest = process.env.CMUX_E2E === "1";
const forceDistLoad = process.env.CMUX_E2E_LOAD_DIST === "1";

if (isE2ETest) {
  // For e2e tests, use a test-specific userData directory
  // Note: We can't use config.rootDir here because config isn't loaded yet
  // However, we must respect CMUX_TEST_ROOT to maintain test isolation
  const testRoot = process.env.CMUX_TEST_ROOT ?? path.join(process.env.HOME ?? "~", ".cmux");
  const e2eUserData = path.join(testRoot, "user-data");
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
let splashWindow: BrowserWindow | null = null;

/**
 * Format timestamp as HH:MM:SS.mmm for readable logging
 */
function timestamp(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const ms = String(now.getMilliseconds()).padStart(3, "0");
  return `${hours}:${minutes}:${seconds}.${ms}`;
}

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
        // Reload without Ctrl+R shortcut (reserved for Code Review refresh)
        {
          label: "Reload",
          click: (_item, focusedWindow) => {
            if (focusedWindow && "reload" in focusedWindow) {
              (focusedWindow as BrowserWindow).reload();
            }
          },
        },
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

/**
 * Create and show splash screen - instant visual feedback (<100ms)
 *
 * Shows a lightweight native window with static HTML while services load.
 * No IPC, no React, no heavy dependencies - just immediate user feedback.
 */
async function showSplashScreen() {
  const startTime = Date.now();
  console.log(`[${timestamp()}] Showing splash screen...`);

  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    transparent: false,
    backgroundColor: "#1f1f1f", // Match splash HTML background (hsl(0 0% 12%)) - prevents white flash
    alwaysOnTop: true,
    center: true,
    resizable: false,
    show: false, // Don't show until HTML is loaded
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Wait for splash HTML to load
  await splashWindow.loadFile(path.join(__dirname, "splash.html"));

  // Wait for the window to actually be shown and rendered before continuing
  // This ensures the splash is visible before we block the event loop with heavy work
  await new Promise<void>((resolve) => {
    splashWindow!.once("show", () => {
      const loadTime = Date.now() - startTime;
      console.log(`[${timestamp()}] Splash screen shown (${loadTime}ms)`);
      // Give one more event loop tick for the window to actually paint
      setImmediate(resolve);
    });
    splashWindow!.show();
  });

  splashWindow.on("closed", () => {
    console.log(`[${timestamp()}] Splash screen closed event`);
    splashWindow = null;
  });
}

/**
 * Close splash screen
 */
function closeSplashScreen() {
  if (splashWindow) {
    console.log(`[${timestamp()}] Closing splash screen...`);
    splashWindow.close();
    splashWindow = null;
  }
}

/**
 * Load backend services (Config, IpcMain, AI SDK, tokenizer)
 *
 * Heavy initialization (~100ms) happens here while splash is visible.
 * Note: Spinner may freeze briefly during this phase. This is acceptable since
 * the splash still provides visual feedback that the app is loading.
 */
async function loadServices(): Promise<void> {
  if (config && ipcMain && loadTokenizerModulesFn) return; // Already loaded

  const startTime = Date.now();
  console.log(`[${timestamp()}] Loading services...`);

  /* eslint-disable no-restricted-syntax */
  // Dynamic imports are justified here for performance:
  // - IpcMain transitively imports the entire AI SDK (ai, @ai-sdk/anthropic, etc.)
  // - These are large modules (~100ms load time) that would block splash from appearing
  // - Loading happens once, then cached
  const [
    { Config: ConfigClass },
    { IpcMain: IpcMainClass },
    { loadTokenizerModules: loadTokenizerFn },
    { UpdaterService: UpdaterServiceClass },
  ] = await Promise.all([
    import("./config"),
    import("./services/ipcMain"),
    import("./utils/main/tokenizer"),
    import("./services/updater"),
  ]);
  /* eslint-enable no-restricted-syntax */
  config = new ConfigClass();
  ipcMain = new IpcMainClass(config);
  loadTokenizerModulesFn = loadTokenizerFn;

  // Initialize updater service in packaged builds or when DEBUG_UPDATER is set
  const { log: logService } = await import("./services/log");
  const debugUpdaterEnabled = logService.parseBoolEnv(process.env.DEBUG_UPDATER);
  
  if (app.isPackaged || debugUpdaterEnabled) {
    updaterService = new UpdaterServiceClass();
    console.log(
      `[${timestamp()}] Updater service initialized (packaged: ${app.isPackaged}, debug: ${debugUpdaterEnabled})`
    );
  } else {
    console.log(
      `[${timestamp()}] Updater service disabled in dev mode (set DEBUG_UPDATER=1 or DEBUG_UPDATER=true to enable)`
    );
  }

  const loadTime = Date.now() - startTime;
  console.log(`[${timestamp()}] Services loaded in ${loadTime}ms`);
}

function createWindow() {
  if (!ipcMain) {
    throw new Error("Services must be loaded before creating window");
  }

  // Calculate window size based on screen dimensions (80% of available space)
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.workArea;

  const windowWidth = Math.max(1200, Math.floor(screenWidth * 0.8));
  const windowHeight = Math.max(800, Math.floor(screenHeight * 0.8));

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    title: "cmux - coder multiplexer",
    // Hide menu bar on Linux by default (like VS Code)
    // User can press Alt to toggle it
    autoHideMenuBar: process.platform === "linux",
    show: false, // Don't show until ready-to-show event
  });

  // Register IPC handlers with the main window
  ipcMain.register(electronIpcMain, mainWindow);

  // Register updater IPC handlers (available in both dev and prod)
  electronIpcMain.handle(IPC_CHANNELS.UPDATE_CHECK, async () => {
    // Note: log interface already includes timestamp and file location
    const { log } = await import("./services/log");
    log.debug(`UPDATE_CHECK called (updaterService: ${updaterService ? "available" : "null"})`);
    if (!updaterService) {
      // Send "idle" status if updater not initialized (dev mode without DEBUG_UPDATER)
      if (mainWindow) {
        mainWindow.webContents.send(IPC_CHANNELS.UPDATE_STATUS, { 
          type: "idle" as const
        });
      }
      return;
    }
    log.debug("Calling updaterService.checkForUpdates()");
    await updaterService.checkForUpdates();
  });

  electronIpcMain.handle(IPC_CHANNELS.UPDATE_DOWNLOAD, async () => {
    if (!updaterService) throw new Error("Updater not available in development");
    await updaterService.downloadUpdate();
  });

  electronIpcMain.handle(IPC_CHANNELS.UPDATE_INSTALL, () => {
    if (!updaterService) throw new Error("Updater not available in development");
    updaterService.installUpdate();
  });

  // Handle status subscription requests
  // Note: React StrictMode in dev causes components to mount twice, resulting in duplicate calls
  electronIpcMain.on(IPC_CHANNELS.UPDATE_STATUS_SUBSCRIBE, async () => {
    const { log } = await import("./services/log");
    log.debug("UPDATE_STATUS_SUBSCRIBE called");
    if (!mainWindow) return;
    const status = updaterService ? updaterService.getStatus() : { type: "idle" };
    log.debug("Sending current status to renderer:", status);
    mainWindow.webContents.send(IPC_CHANNELS.UPDATE_STATUS, status);
  });

  // Set up updater service with the main window (only in production)
  if (updaterService) {
    updaterService.setMainWindow(mainWindow);
    // Note: Checks are initiated by frontend to respect telemetry preference
  }

  // Show window once it's ready and close splash
  mainWindow.once("ready-to-show", () => {
    console.log(`[${timestamp()}] Main window ready to show`);
    mainWindow?.show();
    closeSplashScreen();
  });

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
    try {
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

      // Three-phase startup:
      // 1. Show splash immediately (<100ms) and wait for it to load
      // 2. Load services while splash visible (fast - ~100ms)
      // 3. Create window and start loading content (splash stays visible)
      // 4. When window ready-to-show: close splash, show main window
      //
      // Skip splash in E2E tests to avoid app.firstWindow() grabbing the wrong window
      if (!isE2ETest) {
        await showSplashScreen(); // Wait for splash to actually load
      }
      await loadServices();
      createWindow();
      // Note: splash closes in ready-to-show event handler

      // Start loading tokenizer modules in background after window is created
      // This ensures accurate token counts for first API calls (especially in e2e tests)
      // Loading happens asynchronously and won't block the UI
      if (loadTokenizerModulesFn) {
        void loadTokenizerModulesFn().then(() => {
          console.log(`[${timestamp()}] Tokenizer modules loaded`);
        });
      }
      // No need to auto-start workspaces anymore - they start on demand
    } catch (error) {
      console.error(`[${timestamp()}] Startup failed:`, error);

      closeSplashScreen();

      // Show error dialog to user
      const errorMessage =
        error instanceof Error ? `${error.message}\n\n${error.stack ?? ""}` : String(error);

      dialog.showErrorBox(
        "Startup Failed",
        `The application failed to start:\n\n${errorMessage}\n\nPlease check the console for details.`
      );

      // Quit after showing error
      app.quit();
    }
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
      void (async () => {
        await showSplashScreen();
        await loadServices();
        createWindow();
      })();
    }
  });
}
