import { contextBridge, ipcRenderer } from "electron";
// Use require for the JS constants file (works in preload context)
const { IPC_CHANNELS, getOutputChannel, getClearChannel } = require("./constants/ipc-constants.js");
import type { IPCApi } from "./types/ipc";
import type { UIPermissionMode } from "./types/global";
import type { WorkspaceMetadata } from "./types/workspace";

// Build the API implementation using the shared interface
const api: IPCApi = {
  config: {
    load: () => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_LOAD),
    save: (config) => ipcRenderer.invoke(IPC_CHANNELS.CONFIG_SAVE, config),
  },
  dialog: {
    selectDirectory: () => ipcRenderer.invoke(IPC_CHANNELS.DIALOG_SELECT_DIR),
  },
  git: {
    createWorktree: (projectPath, branchName) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_CREATE_WORKTREE, projectPath, branchName),
    removeWorktree: (workspacePath) =>
      ipcRenderer.invoke(IPC_CHANNELS.GIT_REMOVE_WORKTREE, workspacePath),
  },
  claude: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_LIST),
    streamWorkspaceMeta: () => ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_STREAM_META),
    setPermissionMode: (workspaceId: string, permissionMode: UIPermissionMode) =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_SET_PERMISSION, workspaceId, permissionMode),
    sendMessage: (workspaceId, message) =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_SEND_MESSAGE, workspaceId, message),
    handleSlashCommand: (workspaceId, command) =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_HANDLE_SLASH, workspaceId, command),
    streamHistory: (workspaceId) =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_STREAM_HISTORY, workspaceId),
    removeWorkspace: (workspaceId) =>
      ipcRenderer.invoke(IPC_CHANNELS.CLAUDE_REMOVE_WORKSPACE, workspaceId),

    onOutput: (workspaceId, callback) => {
      const channel = getOutputChannel(workspaceId);
      const handler = (event: any, data: any) => callback(data);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    onClear: (workspaceId, callback) => {
      const channel = getClearChannel(workspaceId);
      const handler = (event: any, data: any) => callback(data);
      ipcRenderer.on(channel, handler);
      return () => ipcRenderer.removeListener(channel, handler);
    },
    onMetadata: (
      callback: (data: { workspaceId: string; metadata: WorkspaceMetadata }) => void
    ) => {
      const handler = (event: any, data: any) => callback(data);
      ipcRenderer.on(IPC_CHANNELS.CLAUDE_METADATA, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.CLAUDE_METADATA, handler);
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
