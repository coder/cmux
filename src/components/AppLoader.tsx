import { useState, useEffect } from "react";
import App from "../App";
import { LoadingScreen } from "./LoadingScreen";
import { useProjectManagement } from "../hooks/useProjectManagement";
import { useWorkspaceStoreRaw } from "../stores/WorkspaceStore";
import { useGitStatusStoreRaw } from "../stores/GitStatusStore";
import { usePersistedState } from "../hooks/usePersistedState";
import type { WorkspaceSelection } from "./ProjectSidebar";
import { AppProvider } from "../contexts/AppContext";
import { WorkspaceProvider, useWorkspaceContext } from "../contexts/WorkspaceContext";

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
  // Workspace selection - restored from localStorage immediately
  const [selectedWorkspace, setSelectedWorkspace] = usePersistedState<WorkspaceSelection | null>(
    "selectedWorkspace",
    null
  );

  // Load projects
  const projectManagement = useProjectManagement();

  // Render App with WorkspaceProvider wrapping it
  return (
    <WorkspaceProvider
      selectedWorkspace={selectedWorkspace}
      onSelectedWorkspaceUpdate={setSelectedWorkspace}
      onProjectsUpdate={projectManagement.setProjects}
    >
      <AppLoaderInner
        projects={projectManagement.projects}
        setProjects={projectManagement.setProjects}
        addProject={projectManagement.addProject}
        removeProject={projectManagement.removeProject}
        selectedWorkspace={selectedWorkspace}
        setSelectedWorkspace={setSelectedWorkspace}
      />
    </WorkspaceProvider>
  );
}

/**
 * Inner component that has access to WorkspaceContext
 */
function AppLoaderInner(props: {
  projects: ReturnType<typeof useProjectManagement>["projects"];
  setProjects: ReturnType<typeof useProjectManagement>["setProjects"];
  addProject: ReturnType<typeof useProjectManagement>["addProject"];
  removeProject: ReturnType<typeof useProjectManagement>["removeProject"];
  selectedWorkspace: WorkspaceSelection | null;
  setSelectedWorkspace: (workspace: WorkspaceSelection | null) => void;
}) {
  const workspaceContext = useWorkspaceContext();

  // Get store instances
  const workspaceStore = useWorkspaceStoreRaw();
  const gitStatusStore = useGitStatusStoreRaw();

  // Track whether stores have been synced
  const [storesSynced, setStoresSynced] = useState(false);

  // Sync stores when metadata finishes loading
  useEffect(() => {
    if (!workspaceContext.loading) {
      workspaceStore.syncWorkspaces(workspaceContext.workspaceMetadata);
      gitStatusStore.syncWorkspaces(workspaceContext.workspaceMetadata);
      setStoresSynced(true);
    } else {
      setStoresSynced(false);
    }
  }, [workspaceContext.loading, workspaceContext.workspaceMetadata, workspaceStore, gitStatusStore]);

  // Restore workspace from URL hash (runs once when stores are synced)
  const [hasRestoredFromHash, setHasRestoredFromHash] = useState(false);

  useEffect(() => {
    const { setSelectedWorkspace } = props;
    // Wait until stores are synced before attempting restoration
    if (!storesSynced) return;

    // Only run once
    if (hasRestoredFromHash) return;

    const hash = window.location.hash;
    if (hash.startsWith("#workspace=")) {
      const workspaceId = decodeURIComponent(hash.substring("#workspace=".length));

      // Find workspace in metadata
      const metadata = workspaceContext.workspaceMetadata.get(workspaceId);

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
  }, [storesSynced, workspaceContext.workspaceMetadata, hasRestoredFromHash, props]);

  // Check for launch project from server (for --add-project flag)
  // This only applies in server mode
  useEffect(() => {
    const { selectedWorkspace, setSelectedWorkspace } = props;
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
      const projectWorkspaces = Array.from(workspaceContext.workspaceMetadata.values()).filter(
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
  }, [storesSynced, hasRestoredFromHash, workspaceContext.workspaceMetadata, props]);

  // Show loading screen until stores are synced
  if (workspaceContext.loading || !storesSynced) {
    return <LoadingScreen />;
  }

  // Render App with all initialized data via context
  return (
    <AppProvider
      projects={props.projects}
      setProjects={props.setProjects}
      addProject={props.addProject}
      removeProject={props.removeProject}
      workspaceMetadata={workspaceContext.workspaceMetadata}
      setWorkspaceMetadata={() => {
        /* no-op now since WorkspaceContext handles it */
      }}
      createWorkspace={workspaceContext.createWorkspace}
      removeWorkspace={workspaceContext.removeWorkspace}
      renameWorkspace={workspaceContext.renameWorkspace}
      selectedWorkspace={props.selectedWorkspace}
      setSelectedWorkspace={props.setSelectedWorkspace}
    >
      <App />
    </AppProvider>
  );
}
