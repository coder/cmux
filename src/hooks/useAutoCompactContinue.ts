import { useEffect } from "react";
import type { WorkspaceState } from "@/hooks/useWorkspaceAggregators";
import { getCompactContinueMessageKey } from "@/constants/storage";

/**
 * Hook to manage auto-continue after compaction
 *
 * Stateless reactive approach:
 * - Watches all workspaces for single compacted message
 * - Returns list of workspaces that need auto-continue
 * - Parent (App.tsx) handles sendMessage with proper options
 *
 * IMPORTANT: sendMessage options (model, thinking level, mode, etc.) are managed by the
 * frontend via useSendMessageOptions hook. The backend does NOT fall back to workspace
 * metadata - frontend must pass complete options.
 */
export function useAutoCompactContinue(
  workspaceStates: Map<string, WorkspaceState>,
  onContinue: (workspaceId: string, message: string) => void
) {
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

          // Notify parent to send the message with proper options
          onContinue(workspaceId, continueMessage);
        }
      }
    }
  }, [workspaceStates, onContinue]);

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
