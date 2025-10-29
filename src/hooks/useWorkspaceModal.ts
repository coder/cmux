import { useState, useCallback, useRef } from "react";
import type { RuntimeConfig } from "@/types/runtime";
import { getRuntimeKey } from "@/constants/storage";
import { parseRuntimeString } from "@/utils/chatCommands";
import type { WorkspaceSelection } from "@/components/ProjectSidebar";

interface WorkspaceModalState {
  isOpen: boolean;
  projectPath: string | null;
  projectName: string;
  branches: string[];
  defaultTrunk: string | undefined;
  loadError: string | null;
  startMessage: string | undefined;
  model: string | undefined;
}

const INITIAL_STATE: WorkspaceModalState = {
  isOpen: false,
  projectPath: null,
  projectName: "",
  branches: [],
  defaultTrunk: undefined,
  loadError: null,
  startMessage: undefined,
  model: undefined,
};

interface UseWorkspaceModalOptions {
  createWorkspace: (
    projectPath: string,
    branchName: string,
    trunkBranch: string,
    runtimeConfig?: RuntimeConfig
  ) => Promise<WorkspaceSelection>;
  setSelectedWorkspace: (workspace: WorkspaceSelection) => void;
  telemetry: {
    workspaceCreated: (workspaceId: string) => void;
  };
}

export function useWorkspaceModal({
  createWorkspace,
  setSelectedWorkspace,
  telemetry,
}: UseWorkspaceModalOptions) {
  const [state, setState] = useState<WorkspaceModalState>(INITIAL_STATE);
  const projectRef = useRef<string | null>(null);

  const openModal = useCallback(
    async (
      projectPath: string,
      initialData?: { startMessage?: string; model?: string; error?: string }
    ) => {
      const projectName =
        projectPath.split("/").pop() ?? projectPath.split("\\").pop() ?? "project";

      projectRef.current = projectPath;
      setState({
        isOpen: true,
        projectPath,
        projectName,
        branches: [],
        defaultTrunk: undefined,
        loadError: initialData?.error ?? null,
        startMessage: initialData?.startMessage,
        model: initialData?.model,
      });

      try {
        const branchResult = await window.api.projects.listBranches(projectPath);

        // Guard against race condition: only update state if this is still the active project
        if (projectRef.current !== projectPath) {
          return;
        }

        const sanitizedBranches = Array.isArray(branchResult?.branches)
          ? branchResult.branches.filter((branch): branch is string => typeof branch === "string")
          : [];

        const recommended =
          typeof branchResult?.recommendedTrunk === "string" &&
          sanitizedBranches.includes(branchResult.recommendedTrunk)
            ? branchResult.recommendedTrunk
            : sanitizedBranches[0];

        setState((prev) => ({
          ...prev,
          branches: sanitizedBranches,
          defaultTrunk: recommended,
          loadError: null,
        }));
      } catch (err) {
        console.error("Failed to load branches for modal:", err);
        const message = err instanceof Error ? err.message : "Unknown error";
        setState((prev) => ({
          ...prev,
          loadError: `Unable to load branches automatically: ${message}. You can still enter the trunk branch manually.`,
        }));
      }
    },
    []
  );

  const closeModal = useCallback(() => {
    projectRef.current = null;
    setState(INITIAL_STATE);
  }, []);

  const handleCreate = useCallback(
    async (
      branchName: string,
      trunkBranch: string,
      runtime?: string,
      startMessage?: string,
      model?: string
    ) => {
      if (!state.projectPath) return;

      console.assert(
        typeof trunkBranch === "string" && trunkBranch.trim().length > 0,
        "Expected trunk branch to be provided by the workspace modal"
      );

      // Parse runtime config if provided
      let runtimeConfig: RuntimeConfig | undefined;
      if (runtime) {
        try {
          runtimeConfig = parseRuntimeString(runtime, branchName);
        } catch (err) {
          console.error("Failed to parse runtime config:", err);
          throw err; // Let modal handle the error
        }
      }

      const newWorkspace = await createWorkspace(
        state.projectPath,
        branchName,
        trunkBranch,
        runtimeConfig
      );
      if (newWorkspace) {
        // Track workspace creation
        telemetry.workspaceCreated(newWorkspace.workspaceId);
        setSelectedWorkspace(newWorkspace);

        // Save runtime preference for this project if provided
        if (runtime) {
          const runtimeKey = getRuntimeKey(state.projectPath);
          localStorage.setItem(runtimeKey, runtime);
        }

        // Send start message if provided
        if (startMessage) {
          // Build send message options - use provided model or default
          const { buildSendMessageOptions } = await import("@/hooks/useSendMessageOptions");
          const sendOptions = buildSendMessageOptions(newWorkspace.workspaceId);

          if (model) {
            sendOptions.model = model;
          }

          // Defer until React finishes rendering and WorkspaceStore subscribes
          requestAnimationFrame(() => {
            void window.api.workspace.sendMessage(
              newWorkspace.workspaceId,
              startMessage,
              sendOptions
            );
          });
        }
      }
    },
    [state.projectPath, createWorkspace, telemetry, setSelectedWorkspace]
  );

  return {
    state,
    openModal,
    closeModal,
    handleCreate,
  };
}
