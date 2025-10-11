import { useEffect } from "react";
import type { WorkspaceState } from "@/hooks/useWorkspaceAggregators";
import { getCompactContinueMessageKey } from "@/constants/storage";
import { buildSendMessageOptions } from "@/hooks/useSendMessageOptions";

/**
 * Hook to manage auto-continue after compaction
 *
 * Stateless reactive approach:
 * - Watches all workspaces for single compacted message
 * - Builds sendMessage options from localStorage
 * - Sends continue message automatically
 *
 * Self-contained: No callback needed. Hook detects condition and handles action.
 *
 * IMPORTANT: sendMessage options (model, thinking level, mode, etc.) are managed by the
 * frontend via buildSendMessageOptions. The backend does NOT fall back to workspace
 * metadata - frontend must pass complete options.
 */
export function useAutoCompactContinue(workspaceStates: Map<string, WorkspaceState>) {
  useEffect(() => {
    // Check all workspaces for completed compaction
    for (const [workspaceId, state] of workspaceStates) {
      // Check if this workspace just compacted (single message marked as compacted)
      if (
        state.messages.length === 1 &&
        state.messages[0].type === "assistant" &&
        state.messages[0].isCompacted === true
      ) {
        const continueMessage = localStorage.getItem(getCompactContinueMessageKey(workspaceId));

        if (continueMessage) {
          // Clean up first to prevent duplicate sends
          localStorage.removeItem(getCompactContinueMessageKey(workspaceId));

          // Build options and send message directly
          const options = buildSendMessageOptions(workspaceId);
          window.api.workspace.sendMessage(workspaceId, continueMessage, options).catch((error) => {
            console.error("Failed to send continue message:", error);
          });
        }
      }
    }
  }, [workspaceStates]);

  // Simple callback to store continue message in localStorage
  // Called by ChatInput when /compact is parsed
  const handleCompactStart = (workspaceId: string, continueMessage: string | undefined) => {
    if (continueMessage) {
      localStorage.setItem(getCompactContinueMessageKey(workspaceId), continueMessage);
    } else {
      // Clear any pending continue message if -c flag not provided
      // Ensures stored message reflects latest user intent
      localStorage.removeItem(getCompactContinueMessageKey(workspaceId));
    }
  };

  return { handleCompactStart };
}
