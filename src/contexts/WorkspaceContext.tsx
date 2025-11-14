import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { FrontendWorkspaceMetadata } from "@/types/workspace";
import type { WorkspaceSelection } from "@/components/ProjectSidebar";
import type { RuntimeConfig } from "@/types/runtime";
import type { ProjectConfig } from "@/config";
import { deleteWorkspaceStorage } from "@/constants/storage";

/**
 * Ensure workspace metadata has createdAt timestamp.
 * DEFENSIVE: Backend guarantees createdAt, but default to 2025-01-01 if missing.
 * This prevents crashes if backend contract is violated.
 */
function ensureCreatedAt(metadata: FrontendWorkspaceMetadata): void {
  if (!metadata.createdAt) {
    console.warn(
      `[Frontend] Workspace ${metadata.id} missing createdAt - using default (2025-01-01)`
    );
    metadata.createdAt = "2025-01-01T00:00:00.000Z";
  }
}

export interface WorkspaceContext {
  // Workspace data
  workspaceMetadata: Map<string, FrontendWorkspaceMetadata>;
  loading: boolean;

  // Workspace operations
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
  refreshWorkspaceMetadata: () => Promise<void>;
  setWorkspaceMetadata: React.Dispatch<
    React.SetStateAction<Map<string, FrontendWorkspaceMetadata>>
  >;

  // Selection
  selectedWorkspace: WorkspaceSelection | null;
  setSelectedWorkspace: (workspace: WorkspaceSelection | null) => void;

  // Workspace creation flow
  pendingNewWorkspaceProject: string | null;
  beginWorkspaceCreation: (projectPath: string) => void;
  clearPendingWorkspaceCreation: () => void;

  // Helpers
  getWorkspaceInfo: (workspaceId: string) => Promise<FrontendWorkspaceMetadata | null>;
}

const WorkspaceContext = createContext<WorkspaceContext | undefined>(undefined);

interface WorkspaceProviderProps {
  children: ReactNode;
  selectedWorkspace: WorkspaceSelection | null;
  onSelectedWorkspaceUpdate: (workspace: WorkspaceSelection | null) => void;
  onProjectsUpdate: (projects: Map<string, ProjectConfig>) => void;
}

export function WorkspaceProvider(props: WorkspaceProviderProps) {
  const [workspaceMetadata, setWorkspaceMetadata] = useState<
    Map<string, FrontendWorkspaceMetadata>
  >(new Map());
  const [loading, setLoading] = useState(true);
  const [pendingNewWorkspaceProject, setPendingNewWorkspaceProject] = useState<string | null>(null);

  const loadWorkspaceMetadata = useCallback(async () => {
    try {
      const metadataList = await window.api.workspace.list();
      const metadataMap = new Map<string, FrontendWorkspaceMetadata>();
      for (const metadata of metadataList) {
        ensureCreatedAt(metadata);
        // Use stable workspace ID as key (not path, which can change)
        metadataMap.set(metadata.id, metadata);
      }
      setWorkspaceMetadata(metadataMap);
    } catch (error) {
      console.error("Failed to load workspace metadata:", error);
      setWorkspaceMetadata(new Map());
    }
  }, []);

  // Load metadata once on mount
  useEffect(() => {
    const { onProjectsUpdate } = props;
    void (async () => {
      await loadWorkspaceMetadata();
      // After loading metadata (which may trigger migration), reload projects
      // to ensure frontend has the updated config with workspace IDs
      const projectsList = await window.api.projects.list();
      const loadedProjects = new Map<string, ProjectConfig>(projectsList);
      onProjectsUpdate(loadedProjects);
      setLoading(false);
    })();
  }, [loadWorkspaceMetadata, props]);

  // Subscribe to metadata updates (for create/rename/delete operations)
  useEffect(() => {
    const { onProjectsUpdate } = props;
    const unsubscribe = window.api.workspace.onMetadata(
      (event: { workspaceId: string; metadata: FrontendWorkspaceMetadata | null }) => {
        setWorkspaceMetadata((prev) => {
          const updated = new Map(prev);
          const isNewWorkspace = !prev.has(event.workspaceId) && event.metadata !== null;

          if (event.metadata === null) {
            // Workspace deleted - remove from map
            updated.delete(event.workspaceId);
          } else {
            ensureCreatedAt(event.metadata);
            updated.set(event.workspaceId, event.metadata);
          }

          // If this is a new workspace (e.g., from fork), reload projects
          // to ensure the sidebar shows the updated workspace list
          if (isNewWorkspace) {
            void (async () => {
              const projectsList = await window.api.projects.list();
              const loadedProjects = new Map<string, ProjectConfig>(projectsList);
              onProjectsUpdate(loadedProjects);
            })();
          }

          return updated;
        });
      }
    );

    return () => {
      unsubscribe();
    };
  }, [props]);

  const createWorkspace = useCallback(
    async (
      projectPath: string,
      branchName: string,
      trunkBranch: string,
      runtimeConfig?: RuntimeConfig
    ) => {
      console.assert(
        typeof trunkBranch === "string" && trunkBranch.trim().length > 0,
        "Expected trunk branch to be provided when creating a workspace"
      );
      const result = await window.api.workspace.create(
        projectPath,
        branchName,
        trunkBranch,
        runtimeConfig
      );
      if (result.success) {
        // Backend has already updated the config - reload projects to get updated state
        const projectsList = await window.api.projects.list();
        const loadedProjects = new Map<string, ProjectConfig>(projectsList);
        props.onProjectsUpdate(loadedProjects);

        // Update metadata immediately to avoid race condition with validation effect
        ensureCreatedAt(result.metadata);
        setWorkspaceMetadata((prev) => {
          const updated = new Map(prev);
          updated.set(result.metadata.id, result.metadata);
          return updated;
        });

        // Return the new workspace selection
        return {
          projectPath,
          projectName: result.metadata.projectName,
          namedWorkspacePath: result.metadata.namedWorkspacePath,
          workspaceId: result.metadata.id,
        };
      } else {
        throw new Error(result.error);
      }
    },
    [props]
  );

  const removeWorkspace = useCallback(
    async (
      workspaceId: string,
      options?: { force?: boolean }
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const result = await window.api.workspace.remove(workspaceId, options);
        if (result.success) {
          // Clean up workspace-specific localStorage keys
          deleteWorkspaceStorage(workspaceId);

          // Backend has already updated the config - reload projects to get updated state
          const projectsList = await window.api.projects.list();
          const loadedProjects = new Map<string, ProjectConfig>(projectsList);
          props.onProjectsUpdate(loadedProjects);

          // Reload workspace metadata
          await loadWorkspaceMetadata();

          // Clear selected workspace if it was removed
          if (props.selectedWorkspace?.workspaceId === workspaceId) {
            props.onSelectedWorkspaceUpdate(null);
          }
          return { success: true };
        } else {
          console.error("Failed to remove workspace:", result.error);
          return { success: false, error: result.error };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Failed to remove workspace:", errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    [loadWorkspaceMetadata, props]
  );

  const renameWorkspace = useCallback(
    async (workspaceId: string, newName: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const result = await window.api.workspace.rename(workspaceId, newName);
        if (result.success) {
          // Backend has already updated the config - reload projects to get updated state
          const projectsList = await window.api.projects.list();
          const loadedProjects = new Map<string, ProjectConfig>(projectsList);
          props.onProjectsUpdate(loadedProjects);

          // Reload workspace metadata
          await loadWorkspaceMetadata();

          // Update selected workspace if it was renamed
          if (props.selectedWorkspace?.workspaceId === workspaceId) {
            const newWorkspaceId = result.data.newWorkspaceId;

            // Get updated workspace metadata from backend
            const newMetadata = await window.api.workspace.getInfo(newWorkspaceId);
            if (newMetadata) {
              ensureCreatedAt(newMetadata);
              props.onSelectedWorkspaceUpdate({
                projectPath: props.selectedWorkspace.projectPath,
                projectName: newMetadata.projectName,
                namedWorkspacePath: newMetadata.namedWorkspacePath,
                workspaceId: newWorkspaceId,
              });
            }
          }
          return { success: true };
        } else {
          console.error("Failed to rename workspace:", result.error);
          return { success: false, error: result.error };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Failed to rename workspace:", errorMessage);
        return { success: false, error: errorMessage };
      }
    },
    [loadWorkspaceMetadata, props]
  );

  const refreshWorkspaceMetadata = useCallback(async () => {
    await loadWorkspaceMetadata();
  }, [loadWorkspaceMetadata]);

  const getWorkspaceInfo = useCallback(async (workspaceId: string) => {
    const metadata = await window.api.workspace.getInfo(workspaceId);
    if (metadata) {
      ensureCreatedAt(metadata);
    }
    return metadata;
  }, []);

  const beginWorkspaceCreation = useCallback((projectPath: string) => {
    setPendingNewWorkspaceProject(projectPath);
  }, []);

  const clearPendingWorkspaceCreation = useCallback(() => {
    setPendingNewWorkspaceProject(null);
  }, []);

  const value = useMemo<WorkspaceContext>(
    () => ({
      workspaceMetadata,
      loading,
      createWorkspace,
      removeWorkspace,
      renameWorkspace,
      refreshWorkspaceMetadata,
      setWorkspaceMetadata,
      selectedWorkspace: props.selectedWorkspace,
      setSelectedWorkspace: props.onSelectedWorkspaceUpdate,
      pendingNewWorkspaceProject,
      beginWorkspaceCreation,
      clearPendingWorkspaceCreation,
      getWorkspaceInfo,
    }),
    [
      workspaceMetadata,
      loading,
      createWorkspace,
      removeWorkspace,
      renameWorkspace,
      refreshWorkspaceMetadata,
      props.selectedWorkspace,
      props.onSelectedWorkspaceUpdate,
      pendingNewWorkspaceProject,
      beginWorkspaceCreation,
      clearPendingWorkspaceCreation,
      getWorkspaceInfo,
    ]
  );

  return <WorkspaceContext.Provider value={value}>{props.children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext(): WorkspaceContext {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspaceContext must be used within WorkspaceProvider");
  }
  return context;
}
