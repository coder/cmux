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
    streamMeta: () => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_STREAM_META),
    sendMessage: (workspaceId, message) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_SEND_MESSAGE, workspaceId, message),
    clearHistory: (workspaceId) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_CLEAR_HISTORY, workspaceId),
    streamHistory: (workspaceId) =>
      ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_STREAM_HISTORY, workspaceId),
    getInfo: (workspaceId) => ipcRenderer.invoke(IPC_CHANNELS.WORKSPACE_GET_INFO, workspaceId),

    onOutput: (workspaceId, callback) => {
      const channel = getOutputChannel(workspaceId);
      const handler = (_event: unknown, data: WorkspaceOutputMessage) => callback(data);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
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
      ipcRenderer.on(IPC_CHANNELS.WORKSPACE_METADATA, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.WORKSPACE_METADATA, handler);
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
