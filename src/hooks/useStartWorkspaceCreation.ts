import { useCallback, useEffect } from "react";
import type { ProjectConfig } from "@/config";
import type { WorkspaceSelection } from "@/components/ProjectSidebar";
import { CUSTOM_EVENTS, type CustomEventPayloads } from "@/constants/events";
import { updatePersistedState } from "@/hooks/usePersistedState";
import {
  getInputKey,
  getModelKey,
  getPendingScopeId,
  getProjectScopeId,
  getRuntimeKey,
  getTrunkBranchKey,
} from "@/constants/storage";
import { RUNTIME_MODE, SSH_RUNTIME_PREFIX } from "@/types/runtime";

export type StartWorkspaceCreationDetail =
  CustomEventPayloads[typeof CUSTOM_EVENTS.START_WORKSPACE_CREATION];

function normalizeRuntimePreference(runtime: string | undefined): string | undefined {
  if (!runtime) {
    return undefined;
  }

  const trimmed = runtime.trim();
  if (!trimmed) {
    return undefined;
  }

  const lower = trimmed.toLowerCase();
  if (lower === RUNTIME_MODE.LOCAL) {
    return undefined;
  }

  if (lower === RUNTIME_MODE.SSH) {
    return RUNTIME_MODE.SSH;
  }

  if (lower.startsWith(SSH_RUNTIME_PREFIX)) {
    const host = trimmed.slice(SSH_RUNTIME_PREFIX.length).trim();
    return host ? `${RUNTIME_MODE.SSH} ${host}` : RUNTIME_MODE.SSH;
  }

  return trimmed;
}

interface UseStartWorkspaceCreationOptions {
  projects: Map<string, ProjectConfig>;
  setPendingNewWorkspaceProject: (projectPath: string | null) => void;
  setSelectedWorkspace: (selection: WorkspaceSelection | null) => void;
}

export function useStartWorkspaceCreation({
  projects,
  setPendingNewWorkspaceProject,
  setSelectedWorkspace,
}: UseStartWorkspaceCreationOptions) {
  const applyWorkspaceCreationPrefill = useCallback(
    (projectPath: string, detail?: StartWorkspaceCreationDetail) => {
      if (!detail) {
        return;
      }

      if (detail.startMessage !== undefined) {
        updatePersistedState(getInputKey(getPendingScopeId(projectPath)), detail.startMessage);
      }

      if (detail.model) {
        updatePersistedState(getModelKey(getProjectScopeId(projectPath)), detail.model);
      }

      if (detail.trunkBranch) {
        const normalizedTrunk = detail.trunkBranch.trim();
        updatePersistedState(
          getTrunkBranchKey(projectPath),
          normalizedTrunk.length > 0 ? normalizedTrunk : undefined
        );
      }

      if (detail.runtime !== undefined) {
        const normalizedRuntime = normalizeRuntimePreference(detail.runtime);
        updatePersistedState(getRuntimeKey(projectPath), normalizedRuntime);
      }
    },
    []
  );

  const startWorkspaceCreation = useCallback(
    (projectPath: string, detail?: StartWorkspaceCreationDetail) => {
      const hasProject = projects.has(projectPath);
      const resolvedProjectPath = hasProject
        ? projectPath
        : projects.size > 0
          ? Array.from(projects.keys())[0]
          : null;

      if (!resolvedProjectPath) {
        console.warn("No projects available for workspace creation");
        return;
      }

      applyWorkspaceCreationPrefill(resolvedProjectPath, detail);
      setPendingNewWorkspaceProject(resolvedProjectPath);
      setSelectedWorkspace(null);
    },
    [projects, applyWorkspaceCreationPrefill, setPendingNewWorkspaceProject, setSelectedWorkspace]
  );

  useEffect(() => {
    const handleStartCreation = (event: Event) => {
      const customEvent = event as CustomEvent<StartWorkspaceCreationDetail>;
      startWorkspaceCreation(customEvent.detail.projectPath, customEvent.detail);
    };

    window.addEventListener(
      CUSTOM_EVENTS.START_WORKSPACE_CREATION,
      handleStartCreation as EventListener
    );

    return () =>
      window.removeEventListener(
        CUSTOM_EVENTS.START_WORKSPACE_CREATION,
        handleStartCreation as EventListener
      );
  }, [startWorkspaceCreation]);

  return startWorkspaceCreation;
}
