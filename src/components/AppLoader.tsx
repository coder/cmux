import { useState, useEffect } from "react";
import App from "../App";
import { LoadingScreen } from "./LoadingScreen";
import { useWorkspaceManagement } from "../hooks/useWorkspaceManagement";
import { useWorkspaceStoreRaw } from "../stores/WorkspaceStore";
import { useGitStatusStoreRaw } from "../stores/GitStatusStore";
import { usePersistedState } from "../hooks/usePersistedState";
import type { WorkspaceSelection } from "./ProjectSidebar";
import { AppProvider } from "../contexts/AppContext";
import { ProjectProvider, useProjectContext } from "../contexts/ProjectContext";

/**
 * AppLoader handles all initialization before rendering the main App:
 * 1. Load workspace metadata and projects
 * 2. Sync stores with loaded data
 * 3. Restore workspace selection from URL hash (if present)
 * 4. Only render App when everything is ready
 *
 * This ensures App.tsx can assume stores are always synced and removes
 * the need for conditional guards in effects.
 */
export function AppLoader() {
  return (
    <ProjectProvider>
      <AppLoaderInner />
    </ProjectProvider>
  );
}

function AppLoaderInner() {
  // Workspace selection - restored from localStorage immediately
  const [selectedWorkspace, setSelectedWorkspace] = usePersistedState<WorkspaceSelection | null>(
    "selectedWorkspace",
    null
  );

  const { refreshProjects } = useProjectContext();

  // Load workspace metadata
  // Pass empty callbacks for now - App will provide the actual handlers
  const workspaceManagement = useWorkspaceManagement({
    selectedWorkspace,
    onProjectsRefresh: refreshProjects,
    onSelectedWorkspaceUpdate: setSelectedWorkspace,
  });

  // Get store instances
  const workspaceStore = useWorkspaceStoreRaw();
  const gitStatusStore = useGitStatusStoreRaw();

  // Track whether stores have been synced
  const [storesSynced, setStoresSynced] = useState(false);

  // Sync stores when metadata finishes loading
  useEffect(() => {
    if (!workspaceManagement.loading) {
      workspaceStore.syncWorkspaces(workspaceManagement.workspaceMetadata);
      gitStatusStore.syncWorkspaces(workspaceManagement.workspaceMetadata);
      setStoresSynced(true);
    } else {
      setStoresSynced(false);
    }
  }, [
    workspaceManagement.loading,
    workspaceManagement.workspaceMetadata,
    workspaceStore,
    gitStatusStore,
  ]);

  // Restore workspace from URL hash (runs once when stores are synced)
  const [hasRestoredFromHash, setHasRestoredFromHash] = useState(false);

  useEffect(() => {
    // Wait until stores are synced before attempting restoration
    if (!storesSynced) return;

    // Only run once
    if (hasRestoredFromHash) return;

    const hash = window.location.hash;
    if (hash.startsWith("#workspace=")) {
      const workspaceId = decodeURIComponent(hash.substring("#workspace=".length));

      // Find workspace in metadata
      const metadata = workspaceManagement.workspaceMetadata.get(workspaceId);

      if (metadata) {
        // Restore from hash (overrides localStorage)
        setSelectedWorkspace({
          workspaceId: metadata.id,
          projectPath: metadata.projectPath,
          projectName: metadata.projectName,
          namedWorkspacePath: metadata.namedWorkspacePath,
        });
      }
    }

    setHasRestoredFromHash(true);
  }, [
    storesSynced,
    workspaceManagement.workspaceMetadata,
    hasRestoredFromHash,
    setSelectedWorkspace,
  ]);

  // Check for launch project from server (for --add-project flag)
  // This only applies in server mode
  useEffect(() => {
    // Wait until stores are synced and hash restoration is complete
    if (!storesSynced || !hasRestoredFromHash) return;

    // Skip if we already have a selected workspace (from localStorage or URL hash)
    if (selectedWorkspace) return;

    // Only check once
    const checkLaunchProject = async () => {
      // Only available in server mode
      if (!window.api.server?.getLaunchProject) return;

      const launchProjectPath = await window.api.server.getLaunchProject();
      if (!launchProjectPath) return;

      // Find first workspace in this project
      const projectWorkspaces = Array.from(workspaceManagement.workspaceMetadata.values()).filter(
        (meta) => meta.projectPath === launchProjectPath
      );

      if (projectWorkspaces.length > 0) {
        // Select the first workspace in the project
        const metadata = projectWorkspaces[0];
        setSelectedWorkspace({
          workspaceId: metadata.id,
          projectPath: metadata.projectPath,
          projectName: metadata.projectName,
          namedWorkspacePath: metadata.namedWorkspacePath,
        });
      }
      // If no workspaces exist yet, just leave the project in the sidebar
      // The user will need to create a workspace
    };

    void checkLaunchProject();
  }, [
    storesSynced,
    hasRestoredFromHash,
    selectedWorkspace,
    workspaceManagement.workspaceMetadata,
    setSelectedWorkspace,
  ]);

  // Show loading screen until stores are synced
  if (workspaceManagement.loading || !storesSynced) {
    return <LoadingScreen />;
  }

  // Render App with all initialized data via context
  return (
    <AppProvider
      workspaceMetadata={workspaceManagement.workspaceMetadata}
      setWorkspaceMetadata={workspaceManagement.setWorkspaceMetadata}
      createWorkspace={workspaceManagement.createWorkspace}
      removeWorkspace={workspaceManagement.removeWorkspace}
      renameWorkspace={workspaceManagement.renameWorkspace}
      selectedWorkspace={selectedWorkspace}
      setSelectedWorkspace={setSelectedWorkspace}
    >
      <App />
    </AppProvider>
  );
}
