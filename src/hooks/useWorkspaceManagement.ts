import { useState, useEffect } from "react";
import type { WorkspaceMetadata } from "@/types/workspace";
import type { WorkspaceSelection } from "@/components/ProjectSidebar";
import type { ProjectConfig } from "@/config";

interface UseWorkspaceManagementProps {
  selectedWorkspace: WorkspaceSelection | null;
  loadedProjects: Map<string, ProjectConfig>;
  onProjectsUpdate: (projects: Map<string, ProjectConfig>) => void;
  onSelectedWorkspaceUpdate: (workspace: WorkspaceSelection | null) => void;
}

/**
 * Hook to manage workspace operations (create, remove, rename, list)
 *
 * Architecture:
 * - IPC operations return complete metadata
 * - We update both workspaceMetadata and projects maps directly
 * - Event listener provides multi-window consistency
 * - No unnecessary reloading from disk
 */
export function useWorkspaceManagement({
  selectedWorkspace,
  loadedProjects,
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
    // This provides multi-window consistency - if another window creates/deletes a workspace,
    // this window will be notified. Primary updates come from IPC responses, not events.
    const unsubscribe = window.api.workspace.onMetadata(
      (data: { workspaceId: string; metadata: WorkspaceMetadata | null }) => {
        setWorkspaceMetadata((prev) => {
          const next = new Map(prev);
          if (data.metadata === null) {
            // Workspace was deleted - remove from map
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
      // Update workspaceMetadata map
      setWorkspaceMetadata((prev) => {
        const next = new Map(prev);
        next.set(result.metadata.workspacePath, result.metadata);
        return next;
      });

      // Update projects map directly - no need to reload from disk
      const updatedProjects = new Map(loadedProjects);
      let projectConfig = updatedProjects.get(projectPath);
      if (!projectConfig) {
        projectConfig = {
          path: projectPath,
          workspaces: [],
        };
        updatedProjects.set(projectPath, projectConfig);
      }
      // Add workspace to project
      projectConfig.workspaces.push({
        path: result.metadata.workspacePath,
      });
      onProjectsUpdate(updatedProjects);

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
    // Find workspace metadata to get workspacePath before removal
    let workspacePath: string | null = null;
    let projectPath: string | null = null;
    for (const [path, metadata] of workspaceMetadata.entries()) {
      if (metadata.id === workspaceId) {
        workspacePath = path;
        // Find which project contains this workspace
        for (const [projPath, project] of loadedProjects.entries()) {
          if (project.workspaces.some((w) => w.path === path)) {
            projectPath = projPath;
            break;
          }
        }
        break;
      }
    }

    const result = await window.api.workspace.remove(workspaceId);
    if (result.success) {
      // Update workspaceMetadata map
      if (workspacePath) {
        setWorkspaceMetadata((prev) => {
          const next = new Map(prev);
          next.delete(workspacePath!);
          return next;
        });
      }

      // Update projects map directly - remove workspace from project
      if (projectPath && workspacePath) {
        const updatedProjects = new Map(loadedProjects);
        const project = updatedProjects.get(projectPath);
        if (project) {
          project.workspaces = project.workspaces.filter((w) => w.path !== workspacePath);
          onProjectsUpdate(updatedProjects);
        }
      }

      // If we removed the selected workspace, select the next workspace in the same project
      if (selectedWorkspace?.workspaceId === workspaceId && projectPath) {
        const project = loadedProjects.get(projectPath);
        const remainingWorkspaces = project?.workspaces.filter((w) => w.path !== workspacePath) ?? [];

        if (remainingWorkspaces.length > 0) {
          // Select the first remaining workspace in the project
          const nextWorkspacePath = remainingWorkspaces[0].path;
          const nextMetadata = workspaceMetadata.get(nextWorkspacePath);

          if (nextMetadata) {
            onSelectedWorkspaceUpdate({
              projectPath,
              projectName: nextMetadata.projectName,
              workspacePath: nextMetadata.workspacePath,
              workspaceId: nextMetadata.id,
            });
          } else {
            onSelectedWorkspaceUpdate(null);
          }
        } else {
          // No workspaces left in this project, clear selection
          onSelectedWorkspaceUpdate(null);
        }
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
    // Find old workspace path before rename
    let oldWorkspacePath: string | null = null;
    let projectPath: string | null = null;
    for (const [path, metadata] of workspaceMetadata.entries()) {
      if (metadata.id === workspaceId) {
        oldWorkspacePath = path;
        // Find which project contains this workspace
        for (const [projPath, project] of loadedProjects.entries()) {
          if (project.workspaces.some((w) => w.path === path)) {
            projectPath = projPath;
            break;
          }
        }
        break;
      }
    }

    const result = await window.api.workspace.rename(workspaceId, newName);
    if (result.success) {
      const newWorkspaceId = result.data.newWorkspaceId;

      // Get updated workspace metadata from backend
      const newMetadata = await window.api.workspace.getInfo(newWorkspaceId);
      if (newMetadata) {
        // Update workspaceMetadata map - remove old, add new
        setWorkspaceMetadata((prev) => {
          const next = new Map(prev);
          if (oldWorkspacePath) {
            next.delete(oldWorkspacePath);
          }
          next.set(newMetadata.workspacePath, newMetadata);
          return next;
        });

        // Update projects map directly - replace old workspace path with new
        if (projectPath && oldWorkspacePath) {
          const updatedProjects = new Map(loadedProjects);
          const project = updatedProjects.get(projectPath);
          if (project) {
            const workspaceIndex = project.workspaces.findIndex((w) => w.path === oldWorkspacePath);
            if (workspaceIndex !== -1) {
              project.workspaces[workspaceIndex] = {
                path: newMetadata.workspacePath,
              };
              onProjectsUpdate(updatedProjects);
            }
          }
        }

        // Update selected workspace if it was renamed
        if (selectedWorkspace?.workspaceId === workspaceId) {
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
