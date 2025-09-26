// Our simplified permission modes for UI
export type UIPermissionMode = 'plan' | 'edit' | 'yolo';

// Claude SDK permission modes
export type SDKPermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

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
        createWorktree: (projectPath: string, branchName: string) => Promise<{ success: boolean; path?: string; error?: string }>;
        removeWorktree: (workspacePath: string) => Promise<{ success: boolean; error?: string }>;
      };
      claude: {
        start: (workspacePath: string, projectName: string, branch: string) => Promise<boolean>;
        isActive: (projectName: string, branch: string) => Promise<boolean>;
        getOutput: (projectName: string, branch: string) => Promise<any[]>;
        list: () => Promise<Array<any>>; // Returns Partial<Workspace> from claudeService
        getWorkspaceInfo: (projectName: string, branch: string) => Promise<{ permissionMode: UIPermissionMode }>;
        setPermissionMode: (projectName: string, branch: string, permissionMode: UIPermissionMode) => Promise<void>;
        sendMessage: (projectName: string, branch: string, message: string) => Promise<import('./result').Result<void, string>>;
        handleSlashCommand: (projectName: string, branch: string, command: string) => Promise<import('./result').Result<void, string>>;
        onOutput: (callback: (data: any) => void) => () => void;
        onClear: (callback: (data: any) => void) => () => void;
        onCompactionComplete: (callback: (data: any) => void) => () => void;
      };
    };
  }
}

export {};