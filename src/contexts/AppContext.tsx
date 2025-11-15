import type { ReactNode, Dispatch, SetStateAction } from "react";
import { createContext, useContext } from "react";
import type { FrontendWorkspaceMetadata } from "@/types/workspace";
import type { WorkspaceSelection } from "@/components/ProjectSidebar";
import type { RuntimeConfig } from "@/types/runtime";

/**
 * App-level state and operations shared across the component tree.
 * Eliminates prop drilling for common data like projects, workspaces, and selection.
 */
interface AppContextType {
  // Workspaces
  workspaceMetadata: Map<string, FrontendWorkspaceMetadata>;
  setWorkspaceMetadata: Dispatch<SetStateAction<Map<string, FrontendWorkspaceMetadata>>>;
  createWorkspace: (
    projectPath: string,
    branchName: string,
    trunkBranch: string,
    runtimeConfig?: RuntimeConfig
  ) => Promise<{
    projectPath: string;
    projectName: string;
    namedWorkspacePath: string;
    workspaceId: string;
  }>;
  removeWorkspace: (
    workspaceId: string,
    options?: { force?: boolean }
  ) => Promise<{ success: boolean; error?: string }>;
  renameWorkspace: (
    workspaceId: string,
    newName: string
  ) => Promise<{ success: boolean; error?: string }>;

  // Selection
  selectedWorkspace: WorkspaceSelection | null;
  setSelectedWorkspace: (workspace: WorkspaceSelection | null) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

interface AppProviderProps extends AppContextType {
  children: ReactNode;
}

export const AppProvider: React.FC<AppProviderProps> = ({ children, ...value }) => {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = (): AppContextType => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within AppProvider");
  }
  return context;
};
