import { useState, useEffect } from "react";
import { getRuntimeKey } from "@/constants/storage";
import {
  type RuntimeMode,
  RUNTIME_MODE,
  parseRuntimeModeAndHost,
  buildRuntimeString,
} from "@/types/runtime";

export interface WorkspaceRuntimeOptions {
  runtimeMode: RuntimeMode;
  sshHost: string;
  /**
   * Returns the runtime string for IPC calls (format: "ssh <host>" or undefined for local)
   */
  getRuntimeString: () => string | undefined;
}

/**
 * Hook to manage workspace creation runtime options with localStorage persistence.
 * Loads saved runtime preference for a project and provides consistent state management.
 * 
 * @param projectPath - Path to the project (used as key for localStorage)
 * @returns Runtime options state and setter
 */
export function useNewWorkspaceOptions(
  projectPath: string | null | undefined
): [WorkspaceRuntimeOptions, (mode: RuntimeMode, host?: string) => void] {
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>(RUNTIME_MODE.LOCAL);
  const [sshHost, setSshHost] = useState("");

  // Load saved runtime preference when projectPath changes
  useEffect(() => {
    if (!projectPath) {
      // Reset to defaults when no project
      setRuntimeMode(RUNTIME_MODE.LOCAL);
      setSshHost("");
      return;
    }

    const runtimeKey = getRuntimeKey(projectPath);
    const savedRuntime = localStorage.getItem(runtimeKey);
    const parsed = parseRuntimeModeAndHost(savedRuntime);
    
    setRuntimeMode(parsed.mode);
    setSshHost(parsed.host);
  }, [projectPath]);

  // Setter for updating both mode and host
  const setRuntimeOptions = (mode: RuntimeMode, host?: string) => {
    setRuntimeMode(mode);
    setSshHost(host ?? "");
  };

  // Helper to get runtime string for IPC calls
  const getRuntimeString = (): string | undefined => {
    return buildRuntimeString(runtimeMode, sshHost);
  };

  return [
    {
      runtimeMode,
      sshHost,
      getRuntimeString,
    },
    setRuntimeOptions,
  ];
}
