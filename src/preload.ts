/**
 * Electron Preload Script with Bundled Constants
 *
 * This file demonstrates a sophisticated solution to a complex problem in Electron development:
 * how to share constants between main and preload processes while respecting Electron's security
 * sandbox restrictions. The challenge is that preload scripts run in a heavily sandboxed environment
 * where they cannot import custom modules using standard Node.js `require()` or ES6 `import` syntax.
 *
 * Our solution uses Bun's bundler with the `--external=electron` flag to create a hybrid approach:
 * 1) Constants from `./constants/ipc-constants.ts` are inlined directly into this compiled script
 * 2) The `electron` module remains external and is safely required at runtime by Electron's sandbox
 * 3) This gives us a single source of truth for IPC constants while avoiding the fragile text
 *    parsing and complex inline replacement scripts that other approaches require.
 *
 * The build command `bun build src/preload.ts --format=cjs --target=node --external=electron --outfile=dist/preload.js`
 * produces a self-contained script where IPC_CHANNELS, getOutputChannel, and getClearChannel are
 * literal values with no runtime imports needed, while contextBridge and ipcRenderer remain as
 * clean `require("electron")` calls that work perfectly in the sandbox environment.
 */

import { contextBridge, ipcRenderer } from "electron";
import type { IPCApi, WorkspaceChatMessage, UpdateStatus } from "./types/ipc";
import type { FrontendWorkspaceMetadata } from "./types/workspace";
import type { ProjectConfig } from "./types/project";
import { IPC_CHANNELS, getChatChannel } from "./constants/ipc-constants";

// Build the API implementation using the shared interface
const api: IPCApi = {
  dialog: {
    selectDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_DIR),
  },
  providers: {
    setProviderConfig: (provider, keyPath, value) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROVIDERS_SET_CONFIG, provider, keyPath, value),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.PROVIDERS_LIST),
  },
  projects: {
    create: (projectPath) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_CREATE, projectPath),
    remove: (projectPath) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_REMOVE, projectPath),
    list: (): Promise<Array<[string, ProjectConfig]>> =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST),
    listBranches: (projectPath: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROJECT_LIST_BRANCHES, projectPath),
    secrets: {
      get: (projectPath) => ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SECRETS_GET, projectPath),
      update: (projectPath, secrets) =>
        ipcRenderer.invoke(IPC_CHANNELS.PROJECT_SECRETS_UPDATE, projectPath, secrets),
    },
  },
  workspace: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_LIST),
    create: (projectPath, branchName, trunkBranch: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_CREATE, projectPath, branchName, trunkBranch),
    remove: (workspaceId: string, options?: { force?: boolean }) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, workspaceId, options),
    rename: (workspaceId: string, newName: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_RENAME, workspaceId, newName),
    fork: (sourceWorkspaceId: string, newName: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_FORK, sourceWorkspaceId, newName),
    sendMessage: (workspaceId, message, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SEND_MESSAGE, workspaceId, message, options),
    resumeStream: (workspaceId, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_RESUME_STREAM, workspaceId, options),
    interruptStream: (workspaceId: string, options?: { abandonPartial?: boolean }) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_INTERRUPT_STREAM, workspaceId, options),
    truncateHistory: (workspaceId, percentage) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_TRUNCATE_HISTORY, workspaceId, percentage),
    replaceChatHistory: (workspaceId, summaryMessage) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REPLACE_HISTORY, workspaceId, summaryMessage),
    getInfo: (workspaceId) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET_INFO, workspaceId),
    executeBash: (workspaceId, script, options) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_EXECUTE_BASH, workspaceId, script, options),
    openTerminal: (workspacePath) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_OPEN_TERMINAL, workspacePath),

    onChat: (workspaceId, callback) => {
      const channel = getChatChannel(workspaceId);
      const handler = (_event: unknown, data: WorkspaceChatMessage) => {
        callback(data);
      };

      // Subscribe to the channel
      ipcRenderer.on(channel, handler);

      // Send subscription request with workspace ID as parameter
      // This allows main process to fetch history for the specific workspace
      ipcRenderer.send(`workspace:chat:subscribe`, workspaceId);

      return () => {
        ipcRenderer.removeListener(channel, handler);
        ipcRenderer.send(`workspace:chat:unsubscribe`, workspaceId);
      };
    },
    onMetadata: (
      callback: (data: { workspaceId: string; metadata: FrontendWorkspaceMetadata }) => void
    ) => {
      const handler = (
        _event: unknown,
        data: { workspaceId: string; metadata: FrontendWorkspaceMetadata }
      ) => callback(data);

      // Subscribe to metadata events
      ipcRenderer.on(IPC_CHANNELS.WORKSPACE_METADATA, handler);

      // Request current metadata state - consistent subscription pattern
      ipcRenderer.send(`workspace:metadata:subscribe`);

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.WORKSPACE_METADATA, handler);
        ipcRenderer.send(`workspace:metadata:unsubscribe`);
      };
    },
  },
  window: {
    setTitle: (title: string) => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_SET_TITLE, title),
  },
  update: {
    check: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CHECK),
    download: () => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_DOWNLOAD),
    install: () => {
      void ipcRenderer.invoke(IPC_CHANNELS.UPDATE_INSTALL);
    },
    onStatus: (callback: (status: UpdateStatus) => void) => {
      const handler = (_event: unknown, status: UpdateStatus) => {
        callback(status);
      };

      // Subscribe to status updates
      ipcRenderer.on(IPC_CHANNELS.UPDATE_STATUS, handler);

      // Request current status - consistent subscription pattern
      ipcRenderer.send(IPC_CHANNELS.UPDATE_STATUS_SUBSCRIBE);

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.UPDATE_STATUS, handler);
      };
    },
  },
};

// Expose the API along with platform/versions
contextBridge.exposeInMainWorld("api", {
  ...api,
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
});
