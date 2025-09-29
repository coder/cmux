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
import type { IPCApi, WorkspaceChatMessage } from "./types/ipc";
import type { WorkspaceMetadata } from "./types/workspace";
import { IPC_CHANNELS, getChatChannel, getClearChannel } from "./constants/ipc-constants";

// Build the API implementation using the shared interface
const api: IPCApi = {
  config: {
    load: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_LOAD),
    save: (config) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SAVE, config),
  },
  dialog: {
    selectDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_DIR),
  },
  providers: {
    setProviderConfig: (provider, keyPath, value) =>
      ipcRenderer.invoke(IPC_CHANNELS.PROVIDERS_SET_CONFIG, provider, keyPath, value),
  },
  workspace: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_LIST),
    create: (projectPath, branchName) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_CREATE, projectPath, branchName),
    remove: (workspaceId: string) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_REMOVE, workspaceId),
    sendMessage: (workspaceId, message) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SEND_MESSAGE, workspaceId, message),
    clearHistory: (workspaceId) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_CLEAR_HISTORY, workspaceId),
    getInfo: (workspaceId) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET_INFO, workspaceId),

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
    onClear: (workspaceId, callback) => {
      const channel = getClearChannel(workspaceId);
      const handler = (_event: unknown, data: unknown) => callback(data);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    onMetadata: (
      callback: (data: { workspaceId: string; metadata: WorkspaceMetadata }) => void
    ) => {
      const handler = (
        _event: unknown,
        data: { workspaceId: string; metadata: WorkspaceMetadata }
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
