import { Result } from "./result";
import { WorkspaceMetadata } from "./workspace";
import { UIPermissionMode } from "./global";

// Import constants from the JavaScript file
// TypeScript can import JS modules and will infer types
// @ts-ignore - Allow importing JS file
import { IPC_CHANNELS, getOutputChannel, getClearChannel } from "../constants/ipc-constants.js";

// Re-export for TypeScript consumers
export { IPC_CHANNELS, getOutputChannel, getClearChannel };

// Type for all channel names
export type IPCChannel = string;

// API method signatures (shared between main and preload)
export interface IPCApi {
  config: {
    load(): Promise<{ projects: Array<[string, any]> }>;
    save(config: { projects: Array<[string, any]> }): Promise<boolean>;
  };
  dialog: {
    selectDirectory(): Promise<string | null>;
  };
  workspace: {
    list(): Promise<WorkspaceMetadata[]>;
    create(
      projectPath: string,
      branchName: string
    ): Promise<{ success: boolean; workspaceId?: string; path?: string; error?: string }>;
    remove(workspaceId: string): Promise<{ success: boolean; error?: string }>;
    streamMeta(): Promise<void>;
    setPermission(workspaceId: string, permissionMode: UIPermissionMode): Promise<void>;
    sendMessage(workspaceId: string, message: string): Promise<Result<void, string>>;
    handleSlash(workspaceId: string, command: string): Promise<Result<void, string>>;
    streamHistory(workspaceId: string): Promise<void>;
    getInfo(workspaceId: string): Promise<WorkspaceMetadata | null>;

    // Event subscriptions (renderer-only)
    onOutput(workspaceId: string, callback: (data: any) => void): () => void;
    onClear(workspaceId: string, callback: (data: any) => void): () => void;
    onMetadata(
      callback: (data: { workspaceId: string; metadata: WorkspaceMetadata }) => void
    ): () => void;
  };
}
