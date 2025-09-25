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
        listActive: () => Promise<Array<{ projectName: string; branch: string }>>;
        sendMessage: (projectName: string, branch: string, message: string) => Promise<boolean>;
        handleSlashCommand: (projectName: string, branch: string, command: string) => Promise<boolean>;
        onOutput: (callback: (data: any) => void) => () => void;
        onClear: (callback: (data: any) => void) => () => void;
        onCompactionComplete: (callback: (data: any) => void) => () => void;
      };
    };
  }
}

export {};