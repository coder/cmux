import { useState, useEffect, useCallback } from "react";
import type { FrontendWorkspaceMetadata } from "@/types/workspace";
import type { WorkspaceSelection } from "@/components/ProjectSidebar";
import type { ProjectConfig } from "@/config";
import { deleteWorkspaceStorage } from "@/constants/storage";

interface UseWorkspaceManagementProps {
  selectedWorkspace: WorkspaceSelection | null;
  onProjectsUpdate: (projects: Map<string, ProjectConfig>) => void;
  onSelectedWorkspaceUpdate: (workspace: WorkspaceSelection | null) => void;
}

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

/**
 * Hook to manage workspace operations (create, remove, rename, list)
 */
export function useWorkspaceManagement({
  selectedWorkspace,
  onProjectsUpdate,
  onSelectedWorkspaceUpdate,
}: UseWorkspaceManagementProps) {
  const [workspaceMetadata, setWorkspaceMetadata] = useState<
    Map<string, FrontendWorkspaceMetadata>
  >(new Map());
  const [loading, setLoading] = useState(true);

  const loadWorkspaceMetadata = useCallback(async () => {
    try {
      const metadataList = await window.api.workspace.list();
      const metadataMap = new Map();
      for (const metadata of metadataList) {
        ensureCreatedAt(metadata);
        // Use stable workspace ID as key (not path, which can change)
        metadataMap.set(metadata.id, metadata);
      }
      setWorkspaceMetadata(metadataMap);
    } catch (error) {
      console.error("Failed to load workspace metadata:", error);
    }
  }, []);

  // Load metadata once on mount
  useEffect(() => {
    void (async () => {
      await loadWorkspaceMetadata();
      // After loading metadata (which may trigger migration), reload projects
      // to ensure frontend has the updated config with workspace IDs
      const projectsList = await window.api.projects.list();
      const loadedProjects = new Map<string, ProjectConfig>(projectsList);
      onProjectsUpdate(loadedProjects);
      setLoading(false);
    })();
  }, [loadWorkspaceMetadata, onProjectsUpdate]);

  // Subscribe to metadata updates (for create/rename/delete operations)
  useEffect(() => {
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
  }, [onProjectsUpdate]);

  const createWorkspace = async (projectPath: string, branchName: string, trunkBranch: string) => {
    console.assert(
      typeof trunkBranch === "string" && trunkBranch.trim().length > 0,
      "Expected trunk branch to be provided when creating a workspace"
    );
    const result = await window.api.workspace.create(projectPath, branchName, trunkBranch);
    if (result.success) {
      // Backend has already updated the config - reload projects to get updated state
      const projectsList = await window.api.projects.list();
      const loadedProjects = new Map<string, ProjectConfig>(projectsList);
      onProjectsUpdate(loadedProjects);

      // Reload workspace metadata to get the new workspace ID
      await loadWorkspaceMetadata();

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
  };

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
          onProjectsUpdate(loadedProjects);

          // Reload workspace metadata
          await loadWorkspaceMetadata();

          // Clear selected workspace if it was removed
          if (selectedWorkspace?.workspaceId === workspaceId) {
            onSelectedWorkspaceUpdate(null);
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
    [loadWorkspaceMetadata, onProjectsUpdate, onSelectedWorkspaceUpdate, selectedWorkspace]
  );

  const renameWorkspace = useCallback(
    async (workspaceId: string, newName: string): Promise<{ success: boolean; error?: string }> => {
      try {
        const result = await window.api.workspace.rename(workspaceId, newName);
        if (result.success) {
          // Backend has already updated the config - reload projects to get updated state
          const projectsList = await window.api.projects.list();
          const loadedProjects = new Map<string, ProjectConfig>(projectsList);
          onProjectsUpdate(loadedProjects);

          // Reload workspace metadata
          await loadWorkspaceMetadata();

          // Update selected workspace if it was renamed
          if (selectedWorkspace?.workspaceId === workspaceId) {
            const newWorkspaceId = result.data.newWorkspaceId;

            // Get updated workspace metadata from backend
            const newMetadata = await window.api.workspace.getInfo(newWorkspaceId);
            if (newMetadata) {
              ensureCreatedAt(newMetadata);
              onSelectedWorkspaceUpdate({
                projectPath: selectedWorkspace.projectPath,
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
    [loadWorkspaceMetadata, onProjectsUpdate, onSelectedWorkspaceUpdate, selectedWorkspace]
  );

  return {
    workspaceMetadata,
    setWorkspaceMetadata,
    loading,
    createWorkspace,
    removeWorkspace,
    renameWorkspace,
  };
}
