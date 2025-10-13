#!/usr/bin/env node

const isServer = process.argv.length > 2 && process.argv[2] === "server";

if (isServer) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./main-server");
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
  ] = await Promise.all([
    import("./config"),
    import("./services/ipcMain"),
    import("./utils/main/tokenizer"),
  ]);
  /* eslint-enable no-restricted-syntax */
  config = new ConfigClass();
  ipcMain = new IpcMainClass(config);
  loadTokenizerModulesFn = loadTokenizerFn;

  const loadTime = Date.now() - startTime;
  console.log(`[${timestamp()}] Services loaded in ${loadTime}ms`);
}

function createWindow() {
  if (!ipcMain) {
    throw new Error("Services must be loaded before creating window");
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
    show: false, // Don't show until ready-to-show event
  });

  // Register IPC handlers with the main window
  ipcMain.register(electronIpcMain, mainWindow);

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
    createMenu();

    // Three-phase startup:
    // 1. Show splash immediately (<100ms) and wait for it to load
    // 2. Load services while splash visible (fast - ~100ms)
    // 3. Create window and start loading content (splash stays visible)
    // 4. When window ready-to-show: close splash, show main window
    await showSplashScreen(); // Wait for splash to actually load
    await loadServices();

    // Migrate workspace configs to include trunk branch (after config is loaded)
    try {
      if (config) {
        await config.migrateWorkspaceTrunkBranches();
      }
    } catch (error) {
      console.error("Failed to migrate workspace trunk branches:", error);
      // Don't block app startup - user can still use the app
    }
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
