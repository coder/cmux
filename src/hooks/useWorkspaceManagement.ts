import { useState, useEffect, useCallback } from "react";
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

  const loadWorkspaceMetadata = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void loadWorkspaceMetadata();
  }, [loadWorkspaceMetadata]);

  const createWorkspace = async (projectPath: string, branchName: string, trunkBranch: string) => {
    console.assert(
      typeof trunkBranch === "string" && trunkBranch.trim().length > 0,
      "Expected trunk branch to be provided when creating a workspace"
    );
    const result = await window.api.workspace.create(projectPath, branchName, trunkBranch);
    if (result.success) {
      // Backend has already updated the config - reload projects to get updated state
      const projectsList = await window.api.projects.list();
      const loadedProjects = new Map(projectsList.map((p) => [p.path, p]));
      onProjectsUpdate(loadedProjects);

      // Reload workspace metadata to get the new workspace ID
      await loadWorkspaceMetadata();

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

  const removeWorkspace = useCallback(
    async (
      workspaceId: string,
      options?: { force?: boolean }
    ): Promise<{ success: boolean; error?: string }> => {
      const result = await window.api.workspace.remove(workspaceId, options);
      if (result.success) {
        // Backend has already updated the config - reload projects to get updated state
        const projectsList = await window.api.projects.list();
        const loadedProjects = new Map(projectsList.map((p) => [p.path, p]));
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
    },
    [loadWorkspaceMetadata, onProjectsUpdate, onSelectedWorkspaceUpdate, selectedWorkspace]
  );

  const renameWorkspace = useCallback(
    async (workspaceId: string, newName: string): Promise<{ success: boolean; error?: string }> => {
      const result = await window.api.workspace.rename(workspaceId, newName);
      if (result.success) {
        // Backend has already updated the config - reload projects to get updated state
        const projectsList = await window.api.projects.list();
        const loadedProjects = new Map(projectsList.map((p) => [p.path, p]));
        onProjectsUpdate(loadedProjects);

        // Reload workspace metadata
        await loadWorkspaceMetadata();

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
    },
    [loadWorkspaceMetadata, onProjectsUpdate, onSelectedWorkspaceUpdate, selectedWorkspace]
  );

  return {
    workspaceMetadata,
    createWorkspace,
    removeWorkspace,
    renameWorkspace,
    loadWorkspaceMetadata,
  };
}
