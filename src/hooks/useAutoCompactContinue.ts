import { useEffect } from "react";
import type { DisplayedMessage } from "@/types/message";
import { getCompactContinueMessageKey } from "@/constants/storage";

/**
 * Hook to manage auto-continue after compaction
 *
 * Stateless reactive approach:
 * - When messages update, checks if chat has single compacted message
 * - If so, checks localStorage for pending continue message
 * - Sends continue message and deletes from storage
 *
 * This avoids event coordination, state tracking, and cleanup complexity.
 */
export function useAutoCompactContinue(
  workspaceId: string | undefined,
  messages: DisplayedMessage[]
) {
  useEffect(() => {
    if (!workspaceId) return;

    // Check if we just compacted (single message marked as compacted)
    if (
      messages.length === 1 &&
      messages[0].type === "assistant" &&
      messages[0].isCompacted === true
    ) {
      const continueMessage = localStorage.getItem(getCompactContinueMessageKey(workspaceId));

      if (continueMessage) {
        // Clean up first to prevent duplicate sends
        localStorage.removeItem(getCompactContinueMessageKey(workspaceId));

        // Send continue message as new user message
        window.api.workspace.sendMessage(workspaceId, continueMessage).catch((error) => {
          console.error("Failed to send continue message:", error);
        });
      }
    }
  }, [workspaceId, messages]);

  // Simple callback to store continue message in localStorage
  // Called by ChatInput when /compact is parsed
  const handleCompactStart = (continueMessage: string | undefined) => {
    if (!workspaceId) return;
    
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
