import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import createIPCMock from "electron-mock-ipc";
import type { BrowserWindow, IpcMain as ElectronIpcMain, WebContents } from "electron";
import { Config } from "@/config";
import { IpcMain } from "@/services/ipcMain";

type MockedElectron = ReturnType<typeof createIPCMock>;

interface CreateHeadlessEnvironmentOptions {
  /**
   * Override the root directory for Config. If omitted, a temporary directory is created.
   */
  rootDir?: string;
}

export interface HeadlessEnvironment {
  config: Config;
  ipcMain: IpcMain;
  mockIpcMain: ElectronIpcMain;
  mockIpcRenderer: Electron.IpcRenderer;
  mockWindow: BrowserWindow;
  sentEvents: Array<{ channel: string; data: unknown }>;
  rootDir: string;
  dispose: () => Promise<void>;
}

function createMockBrowserWindow(): {
  window: BrowserWindow;
  sentEvents: Array<{ channel: string; data: unknown }>;
} {
  const sentEvents: Array<{ channel: string; data: unknown }> = [];

  const mockWindow = {
    webContents: {
      send: (channel: string, data: unknown) => {
        sentEvents.push({ channel, data });
      },
      openDevTools: () => {
        throw new Error("openDevTools is not supported in headless mode");
      },
    } as unknown as WebContents,
    isMinimized: () => false,
    restore: () => undefined,
    focus: () => undefined,
    loadURL: () => {
      throw new Error("loadURL should not be called in headless mode");
    },
    on: () => undefined,
    setTitle: () => undefined,
  } as unknown as BrowserWindow;

  return { window: mockWindow, sentEvents };
}

async function establishRootDir(providedRootDir?: string): Promise<{
  rootDir: string;
  dispose: () => Promise<void>;
}> {
  if (providedRootDir) {
    return {
      rootDir: providedRootDir,
      dispose: async () => {
        // Caller owns the directory; nothing to clean up.
      },
    };
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cmux-headless-"));
  return {
    rootDir: tempRoot,
    dispose: async () => {
      await fs.rm(tempRoot, { recursive: true, force: true });
    },
  };
}

function assertMockedElectron(mocked: MockedElectron): void {
  if (!mocked || typeof mocked !== "object") {
    throw new Error("Failed to initialize electron-mock-ipc");
  }

  if (!("ipcMain" in mocked) || !mocked.ipcMain) {
    throw new Error("electron-mock-ipc returned an invalid ipcMain");
  }

  if (!("ipcRenderer" in mocked) || !mocked.ipcRenderer) {
    throw new Error("electron-mock-ipc returned an invalid ipcRenderer");
  }
}

export async function createHeadlessEnvironment(
  options: CreateHeadlessEnvironmentOptions = {}
): Promise<HeadlessEnvironment> {
  const { rootDir, dispose: disposeRootDir } = await establishRootDir(options.rootDir);

  const config = new Config(rootDir);

  const { window: mockWindow, sentEvents } = createMockBrowserWindow();

  const mockedElectron = createIPCMock();
  assertMockedElectron(mockedElectron);
  const mockIpcMainModule = mockedElectron.ipcMain;
  const mockIpcRendererModule = mockedElectron.ipcRenderer;

  const ipcMain = new IpcMain(config);
  ipcMain.register(mockIpcMainModule, mockWindow);

  const dispose = async () => {
    sentEvents.length = 0;
    await disposeRootDir();
  };

  return {
    config,
    ipcMain,
    mockIpcMain: mockIpcMainModule,
    mockIpcRenderer: mockIpcRendererModule,
    mockWindow,
    sentEvents,
    rootDir,
    dispose,
  };
}
