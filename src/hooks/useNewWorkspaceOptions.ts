import { useState, useEffect } from "react";
import { getRuntimeKey } from "@/constants/storage";

export interface WorkspaceRuntimeOptions {
  runtimeMode: "local" | "ssh";
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
 * @param enabled - Whether to load saved preferences (default: true)
 * @returns Runtime options state and setter
 */
export function useNewWorkspaceOptions(
  projectPath: string | null | undefined,
  enabled = true
): [WorkspaceRuntimeOptions, (mode: "local" | "ssh", host?: string) => void] {
  const [runtimeMode, setRuntimeMode] = useState<"local" | "ssh">("local");
  const [sshHost, setSshHost] = useState("");

  // Load saved runtime preference when projectPath changes
  useEffect(() => {
    if (!enabled || !projectPath) {
      // Reset to defaults when disabled or no project
      setRuntimeMode("local");
      setSshHost("");
      return;
    }

    const runtimeKey = getRuntimeKey(projectPath);
    const savedRuntime = localStorage.getItem(runtimeKey);
    
    if (savedRuntime) {
      // Parse the saved runtime string (format: "ssh <host>" or undefined for local)
      if (savedRuntime.startsWith("ssh ")) {
        const host = savedRuntime.substring(4).trim();
        setRuntimeMode("ssh");
        setSshHost(host);
      } else {
        setRuntimeMode("local");
        setSshHost("");
      }
    } else {
      // No saved preference, use defaults
      setRuntimeMode("local");
      setSshHost("");
    }
  }, [projectPath, enabled]);

  // Setter for updating both mode and host
  const setRuntimeOptions = (mode: "local" | "ssh", host?: string) => {
    setRuntimeMode(mode);
    setSshHost(host ?? "");
  };

  // Helper to get runtime string for IPC calls
  const getRuntimeString = (): string | undefined => {
    if (runtimeMode === "ssh") {
      const trimmedHost = sshHost.trim();
      return trimmedHost ? `ssh ${trimmedHost}` : undefined;
    }
    return undefined;
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
