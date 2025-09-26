// Our simplified permission modes for UI
export type UIPermissionMode = "plan" | "edit" | "yolo";

// Claude SDK permission modes
export type SDKPermissionMode = "default" | "acceptEdits" | "bypassPermissions" | "plan";

declare global {
  interface Window {
    api: {
      platform: string;
      versions: {
        node: string;
        chrome: string;
        electron: string;
      };
      config: {
        load: () => Promise<{ projects: Array<[string, any]> }>;
        save: (config: { projects: Array<[string, any]> }) => Promise<boolean>;
      };
      dialog: {
        selectDirectory: () => Promise<string | null>;
      };
      git: {
        createWorktree: (
          projectPath: string,
          branchName: string
        ) => Promise<{ success: boolean; path?: string; error?: string }>;
        removeWorktree: (workspacePath: string) => Promise<{ success: boolean; error?: string }>;
      };
      claude: {
        list: () => Promise<Array<import("./workspace").WorkspaceMetadata>>;
        streamWorkspaceMeta: () => Promise<void>;
        setPermissionMode: (workspaceId: string, permissionMode: UIPermissionMode) => Promise<void>;
        sendMessage: (
          workspaceId: string,
          message: string
        ) => Promise<import("./result").Result<void, string>>;
        handleSlashCommand: (
          workspaceId: string,
          command: string
        ) => Promise<import("./result").Result<void, string>>;
        streamHistory: (workspaceId: string) => Promise<void>;
        onOutput: (workspaceId: string, callback: (data: any) => void) => () => void;
        onClear: (workspaceId: string, callback: (data: any) => void) => () => void;
        onMetadata: (
          callback: (data: {
            workspaceId: string;
            metadata: import("./workspace").WorkspaceMetadata;
          }) => void
        ) => () => void;
        removeWorkspace: (workspaceId: string) => Promise<void>;
      };
    };
  }
}

export {};
