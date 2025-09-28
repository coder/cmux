import { contextBridge, ipcRenderer } from "electron";
import type { IPCApi, WorkspaceOutputMessage } from "./types/ipc";
import type { WorkspaceMetadata } from "./types/workspace";
// Import JS constants with proper typing
import { IPC_CHANNELS, getOutputChannel, getClearChannel } from "./constants/ipc-constants.js";

// Build the API implementation using the shared interface
const api: IPCApi = {
  config: {
    load: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_LOAD),
    save: (config) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SAVE, config),
  },
  dialog: {
    selectDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_DIR),
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

    onChatHistory: (workspaceId, callback) => {
      const channel = getOutputChannel(workspaceId);
      const handler = (_event: unknown, data: WorkspaceOutputMessage) => {
        callback(data);
      };

      // Subscribe to the channel
      ipcRenderer.on(channel, handler);

      // Immediately request historical data by sending a signal to main process
      // We'll use a special event to request history
      ipcRenderer.send(`${channel}:subscribe`);

      return () => {
        ipcRenderer.removeListener(channel, handler);
        ipcRenderer.send(`${channel}:unsubscribe`);
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

      // Request current metadata state
      ipcRenderer.send(`${IPC_CHANNELS.WORKSPACE_METADATA}:subscribe`);

      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.WORKSPACE_METADATA, handler);
        ipcRenderer.send(`${IPC_CHANNELS.WORKSPACE_METADATA}:unsubscribe`);
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
