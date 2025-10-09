import { useState, useEffect } from "react";
import type { WorkspaceMetadata } from "@/types/workspace";
import type { WorkspaceSelection } from "@/components/ProjectSidebar";
import type { ProjectConfig } from "@/config";

interface UseWorkspaceManagementProps {
  selectedWorkspace: WorkspaceSelection | null;
  onProjectsUpdate: (projects: Map<string, ProjectConfig>) => void;
  onSelectedWorkspaceUpdate: (workspace: WorkspaceSelection | null) => void;
}

/**
 * Hook to manage workspace operations (create, remove, rename, list)
 */
export function useWorkspaceManagement({
  selectedWorkspace,
  onProjectsUpdate,
  onSelectedWorkspaceUpdate,
}: UseWorkspaceManagementProps) {
  const [workspaceMetadata, setWorkspaceMetadata] = useState<Map<string, WorkspaceMetadata>>(
    new Map()
  );

  // Load initial workspace metadata and subscribe to real-time updates
  useEffect(() => {
    void loadWorkspaceMetadata();

    // Subscribe to real-time workspace metadata updates from backend
    const unsubscribe = window.api.workspace.onMetadata(
      (data: { workspaceId: string; metadata: WorkspaceMetadata | null }) => {
        setWorkspaceMetadata((prev) => {
          const next = new Map(prev);
          if (data.metadata === null) {
            // Workspace was deleted - remove from map
            // Find and remove by workspace ID
            for (const [key, value] of next.entries()) {
              if (value.id === data.workspaceId) {
                next.delete(key);
                break;
              }
            }
          } else {
            // Workspace was created or updated - add/update in map
            next.set(data.metadata.workspacePath, data.metadata);
          }
          return next;
        });
      }
    );

    return () => {
      unsubscribe();
    };
  }, []);

  const loadWorkspaceMetadata = async () => {
    try {
      const metadataList = await window.api.workspace.list();
      const metadataMap = new Map();
      for (const metadata of metadataList) {
        metadataMap.set(metadata.workspacePath, metadata);
      }
      setWorkspaceMetadata(metadataMap);
    } catch (error) {
      console.error("Failed to load workspace metadata:", error);
    }
  };

  const createWorkspace = async (projectPath: string, branchName: string) => {
    const result = await window.api.workspace.create(projectPath, branchName);
    if (result.success) {
      // Backend has already updated the config - reload projects to get updated state
      const projectsList = await window.api.projects.list();
      const loadedProjects = new Map(projectsList.map((p) => [p.path, p]));
      onProjectsUpdate(loadedProjects);

      // No need to reload workspace metadata - the onWorkspaceMetadata event listener
      // will update it automatically when the backend emits the event

      // Return the new workspace selection
      return {
        projectPath,
        projectName: result.metadata.projectName,
        workspacePath: result.metadata.workspacePath,
        workspaceId: result.metadata.id,
      };
    } else {
      throw new Error(result.error);
    }
  };

  const removeWorkspace = async (
    workspaceId: string
  ): Promise<{ success: boolean; error?: string }> => {
    const result = await window.api.workspace.remove(workspaceId);
    if (result.success) {
      // Backend has already updated the config - reload projects to get updated state
      const projectsList = await window.api.projects.list();
      const loadedProjects = new Map(projectsList.map((p) => [p.path, p]));
      onProjectsUpdate(loadedProjects);

      // No need to reload workspace metadata - the onWorkspaceMetadata event listener
      // will update it automatically when the backend emits the event

      // Clear selected workspace if it was removed
      if (selectedWorkspace?.workspaceId === workspaceId) {
        onSelectedWorkspaceUpdate(null);
      }
      return { success: true };
    } else {
      console.error("Failed to remove workspace:", result.error);
      return { success: false, error: result.error };
    }
  };

  const renameWorkspace = async (
    workspaceId: string,
    newName: string
  ): Promise<{ success: boolean; error?: string }> => {
    const result = await window.api.workspace.rename(workspaceId, newName);
    if (result.success) {
      // Backend has already updated the config - reload projects to get updated state
      const projectsList = await window.api.projects.list();
      const loadedProjects = new Map(projectsList.map((p) => [p.path, p]));
      onProjectsUpdate(loadedProjects);

      // No need to reload workspace metadata - the onWorkspaceMetadata event listener
      // will update it automatically when the backend emits the event

      // Update selected workspace if it was renamed
      if (selectedWorkspace?.workspaceId === workspaceId) {
        const newWorkspaceId = result.data.newWorkspaceId;

        // Get updated workspace metadata from backend
        const newMetadata = await window.api.workspace.getInfo(newWorkspaceId);
        if (newMetadata) {
          onSelectedWorkspaceUpdate({
            projectPath: selectedWorkspace.projectPath,
            projectName: newMetadata.projectName,
            workspacePath: newMetadata.workspacePath,
            workspaceId: newWorkspaceId,
          });
        }
      }
      return { success: true };
    } else {
      console.error("Failed to rename workspace:", result.error);
      return { success: false, error: result.error };
    }
  };

  return {
    workspaceMetadata,
    createWorkspace,
    removeWorkspace,
    renameWorkspace,
    loadWorkspaceMetadata,
  };
}
