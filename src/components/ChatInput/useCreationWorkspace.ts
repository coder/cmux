import { useState, useEffect, useCallback } from "react";
import type { FrontendWorkspaceMetadata } from "@/types/workspace";
import type { RuntimeConfig } from "@/types/runtime";
import type { RUNTIME_MODE } from "@/types/runtime";
import { parseRuntimeString } from "@/utils/chatCommands";
import { getRuntimeKey } from "@/constants/storage";
import { updatePersistedState } from "@/hooks/usePersistedState";
import { useNewWorkspaceOptions } from "@/hooks/useNewWorkspaceOptions";
import { useSendMessageOptions } from "@/hooks/useSendMessageOptions";
import { extractErrorMessage } from "./utils";

interface UseCreationWorkspaceOptions {
  projectPath: string;
  onWorkspaceCreated: (metadata: FrontendWorkspaceMetadata) => void;
}

interface UseCreationWorkspaceReturn {
  branches: string[];
  trunkBranch: string;
  setTrunkBranch: (branch: string) => void;
  runtimeMode: typeof RUNTIME_MODE.LOCAL | typeof RUNTIME_MODE.SSH;
  sshHost: string;
  setRuntimeOptions: (
    mode: typeof RUNTIME_MODE.LOCAL | typeof RUNTIME_MODE.SSH,
    host: string
  ) => void;
  error: string | null;
  setError: (error: string | null) => void;
  isSending: boolean;
  handleSend: (message: string) => Promise<void>;
}

/**
 * Hook for managing workspace creation state and logic
 * Handles:
 * - Branch selection
 * - Runtime configuration (local vs SSH)
 * - Message sending with workspace creation
 */
export function useCreationWorkspace({
  projectPath,
  onWorkspaceCreated,
}: UseCreationWorkspaceOptions): UseCreationWorkspaceReturn {
  const [branches, setBranches] = useState<string[]>([]);
  const [trunkBranch, setTrunkBranch] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Runtime configuration (Local vs SSH)
  const [runtimeOptions, setRuntimeOptions] = useNewWorkspaceOptions(projectPath);
  const { runtimeMode, sshHost, getRuntimeString } = runtimeOptions;

  // Get send options from shared hook (uses project-scoped storage key)
  const sendMessageOptions = useSendMessageOptions(`__project__${projectPath}`);

  // Load branches on mount
  useEffect(() => {
    const loadBranches = async () => {
      try {
        const result = await window.api.projects.listBranches(projectPath);
        setBranches(result.branches);
        if (result.recommendedTrunk) {
          setTrunkBranch(result.recommendedTrunk);
        } else if (result.branches.length > 0) {
          setTrunkBranch(result.branches[0]);
        }
      } catch (err) {
        console.error("Failed to load branches:", err);
      }
    };
    void loadBranches();
  }, [projectPath]);

  const handleSend = useCallback(
    async (message: string) => {
      if (!message.trim() || isSending) return;

      setIsSending(true);
      setError(null);

      try {
        // Get runtime config from options
        const runtimeString = getRuntimeString();
        const runtimeConfig: RuntimeConfig | undefined = runtimeString
          ? parseRuntimeString(runtimeString, "")
          : undefined;

        // Send message with runtime config and creation-specific params
        const result = await window.api.workspace.sendMessage(null, message, {
          ...sendMessageOptions,
          runtimeConfig,
          projectPath, // Pass projectPath when workspaceId is null
          trunkBranch, // Pass selected trunk branch
        });

        if (!result.success) {
          setError(extractErrorMessage(result.error));
          setIsSending(false);
          return;
        }

        // Check if this is a workspace creation result (has metadata field)
        if ("metadata" in result && result.metadata) {
          // Save runtime preference for this project
          const runtimeString = getRuntimeString();
          if (runtimeString) {
            const runtimeKey = getRuntimeKey(projectPath);
            updatePersistedState(runtimeKey, runtimeString);
          }

          // Notify parent to switch workspace (clears input via parent unmount)
          onWorkspaceCreated(result.metadata);
        } else {
          // This shouldn't happen for null workspaceId, but handle gracefully
          setError("Unexpected response from server");
          setIsSending(false);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(`Failed to create workspace: ${errorMessage}`);
        setIsSending(false);
      }
    },
    [isSending, projectPath, onWorkspaceCreated, getRuntimeString, sendMessageOptions, trunkBranch]
  );

  return {
    branches,
    trunkBranch,
    setTrunkBranch,
    runtimeMode,
    sshHost,
    setRuntimeOptions,
    error,
    setError,
    isSending,
    handleSend,
  };
}
