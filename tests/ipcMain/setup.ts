import * as os from "os";
import * as path from "path";
import * as fs from "fs/promises";
import type { BrowserWindow, IpcMain as ElectronIpcMain, WebContents } from "electron";
import type { IpcRenderer } from "electron";
import createIPCMock from "electron-mock-ipc";
import { Config } from "../../src/config";
import { IpcMain } from "../../src/services/ipcMain";
import { IPC_CHANNELS } from "../../src/constants/ipc-constants";
import { generateBranchName, createWorkspace } from "./helpers";
import { shouldRunIntegrationTests, validateApiKeys, getApiKey } from "../testUtils";
import { loadTokenizerModules } from "../../src/utils/main/tokenizer";
import { preloadAISDKProviders } from "../../src/services/aiService";

export interface TestEnvironment {
  config: Config;
  ipcMain: IpcMain;
  mockIpcMain: ElectronIpcMain;
  mockIpcRenderer: Electron.IpcRenderer;
  mockWindow: BrowserWindow;
  tempDir: string;
  sentEvents: Array<{ channel: string; data: unknown }>;
}

/**
 * Create a mock BrowserWindow that captures sent events
 */
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
      openDevTools: jest.fn(),
    } as unknown as WebContents,
    isMinimized: jest.fn(() => false),
    restore: jest.fn(),
    focus: jest.fn(),
    loadURL: jest.fn(),
    on: jest.fn(),
    setTitle: jest.fn(),
  } as unknown as BrowserWindow;

  return { window: mockWindow, sentEvents };
}

/**
 * Create a test environment with temporary config and mocked IPC
 */
export async function createTestEnvironment(): Promise<TestEnvironment> {
  // Create temporary directory for test config
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cmux-test-"));

  // Create config with temporary directory
  const config = new Config(tempDir);

  // Create mock BrowserWindow
  const { window: mockWindow, sentEvents } = createMockBrowserWindow();

  // Create mock IPC
  const mocked = createIPCMock();
  const mockIpcMainModule = mocked.ipcMain;
  const mockIpcRendererModule = mocked.ipcRenderer;

  // Create IpcMain instance
  const ipcMain = new IpcMain(config);

  // Register handlers with mock ipcMain and window
  ipcMain.register(mockIpcMainModule, mockWindow);

  return {
    config,
    ipcMain,
    mockIpcMain: mockIpcMainModule,
    mockIpcRenderer: mockIpcRendererModule,
    mockWindow,
    tempDir,
    sentEvents,
  };
}

/**
 * Cleanup test environment (remove temporary directory) with retry logic
 */
export async function cleanupTestEnvironment(env: TestEnvironment): Promise<void> {
  const maxRetries = 3;
  let lastError: unknown;

  for (let i = 0; i < maxRetries; i++) {
    try {
      await fs.rm(env.tempDir, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      // Wait before retry (files might be locked temporarily)
      if (i < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
      }
    }
  }
  console.warn(`Failed to cleanup test environment after ${maxRetries} attempts:`, lastError);
}

/**
 * Setup provider configuration via IPC
 */
export async function setupProviders(
  mockIpcRenderer: Electron.IpcRenderer,
  providers: Record<string, { apiKey: string; [key: string]: unknown }>
): Promise<void> {
  for (const [providerName, providerConfig] of Object.entries(providers)) {
    for (const [key, value] of Object.entries(providerConfig)) {
      const result = await mockIpcRenderer.invoke(
        IPC_CHANNELS.PROVIDERS_SET_CONFIG,
        providerName,
        [key],
        String(value)
      );

      if (!result.success) {
        throw new Error(
          `Failed to set provider config for ${providerName}.${key}: ${result.error}`
        );
      }
    }
  }
}

// Re-export test utilities for backwards compatibility
export { shouldRunIntegrationTests, validateApiKeys, getApiKey };

/**
 * Setup a complete workspace with provider
 * Encapsulates: env creation, provider setup, workspace creation, event clearing
 */
export async function setupWorkspace(
  provider: string,
  branchPrefix?: string
): Promise<{
  env: TestEnvironment;
  workspaceId: string;
  workspacePath: string;
  branchName: string;
  tempGitRepo: string;
  cleanup: () => Promise<void>;
}> {
  const { createTempGitRepo, cleanupTempGitRepo } = await import("./helpers");

  // Preload tokenizer modules to ensure accurate token counts for API calls
  // Without this, tests would use /4 approximation which can cause API errors
  await loadTokenizerModules();

  // Preload AI SDK providers to avoid race conditions with dynamic imports
  // in concurrent test environments
  await preloadAISDKProviders();

  // Create dedicated temp git repo for this test
  const tempGitRepo = await createTempGitRepo();

  const env = await createTestEnvironment();

  await setupProviders(env.mockIpcRenderer, {
    [provider]: {
      apiKey: getApiKey(`${provider.toUpperCase()}_API_KEY`),
    },
  });

  const branchName = generateBranchName(branchPrefix || provider);
  const createResult = await createWorkspace(env.mockIpcRenderer, tempGitRepo, branchName);

  if (!createResult.success) {
    await cleanupTempGitRepo(tempGitRepo);
    throw new Error(`Workspace creation failed: ${createResult.error}`);
  }

  if (!createResult.metadata.id) {
    await cleanupTempGitRepo(tempGitRepo);
    throw new Error("Workspace ID not returned from creation");
  }

  if (!createResult.metadata.namedWorkspacePath) {
    await cleanupTempGitRepo(tempGitRepo);
    throw new Error("Workspace path not returned from creation");
  }

  // Clear events from workspace creation
  env.sentEvents.length = 0;

  const cleanup = async () => {
    await cleanupTestEnvironment(env);
    await cleanupTempGitRepo(tempGitRepo);
  };

  return {
    env,
    workspaceId: createResult.metadata.id,
    workspacePath: createResult.metadata.namedWorkspacePath,
    branchName,
    tempGitRepo,
    cleanup,
  };
}

/**
 * Setup workspace without provider (for API key error tests)
 */
export async function setupWorkspaceWithoutProvider(branchPrefix?: string): Promise<{
  env: TestEnvironment;
  workspaceId: string;
  workspacePath: string;
  branchName: string;
  tempGitRepo: string;
  cleanup: () => Promise<void>;
}> {
  const { createTempGitRepo, cleanupTempGitRepo } = await import("./helpers");

  // Create dedicated temp git repo for this test
  const tempGitRepo = await createTempGitRepo();

  const env = await createTestEnvironment();

  const branchName = generateBranchName(branchPrefix || "noapi");
  const createResult = await createWorkspace(env.mockIpcRenderer, tempGitRepo, branchName);

  if (!createResult.success) {
    await cleanupTempGitRepo(tempGitRepo);
    throw new Error(`Workspace creation failed: ${createResult.error}`);
  }

  if (!createResult.metadata.id) {
    await cleanupTempGitRepo(tempGitRepo);
    throw new Error("Workspace ID not returned from creation");
  }

  if (!createResult.metadata.namedWorkspacePath) {
    await cleanupTempGitRepo(tempGitRepo);
    throw new Error("Workspace path not returned from creation");
  }

  env.sentEvents.length = 0;

  const cleanup = async () => {
    await cleanupTestEnvironment(env);
    await cleanupTempGitRepo(tempGitRepo);
  };

  return {
    env,
    workspaceId: createResult.metadata.id,
    workspacePath: createResult.metadata.namedWorkspacePath,
    branchName,
    tempGitRepo,
    cleanup,
  };
}
