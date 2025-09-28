// Type definitions for ipc-constants.js

export interface IPCChannels {
  // Config channels
  CONFIG_LOAD: string;
  CONFIG_SAVE: string;

  // Dialog channels
  DIALOG_SELECT_DIR: string;

  // Workspace channels
  WORKSPACE_LIST: string;
  WORKSPACE_CREATE: string;
  WORKSPACE_REMOVE: string;
  WORKSPACE_STREAM_META: string;
  WORKSPACE_SEND_MESSAGE: string;
  WORKSPACE_CLEAR_HISTORY: string;
  WORKSPACE_STREAM_HISTORY: string;
  WORKSPACE_GET_INFO: string;

  // Dynamic channel prefixes
  WORKSPACE_OUTPUT_PREFIX: string;
  WORKSPACE_CLEAR_PREFIX: string;
  WORKSPACE_METADATA: string;
}

export declare const IPC_CHANNELS: IPCChannels;
export declare function getOutputChannel(workspaceId: string): string;
export declare function getClearChannel(workspaceId: string): string;
