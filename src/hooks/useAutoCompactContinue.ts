import { useEffect, useRef, useCallback } from "react";
import { CUSTOM_EVENTS } from "@/constants/events";
import { getCompactContinueMessageKey } from "@/constants/storage";

/**
 * Hook to manage auto-continue after compaction
 *
 * When a workspace initiates compaction with the -c flag, this hook:
 * 1. Stores the continue message in localStorage (per-workspace)
 * 2. Listens for COMPACTION_COMPLETE event
 * 3. Reads the continue message from localStorage
 * 4. Sends it as a new user message
 * 5. Deletes the stored message to prevent reuse
 *
 * The parent component owns all localStorage operations to prevent bugs from
 * stale or orphaned state across component lifecycles.
 */
export function useAutoCompactContinue() {
  // Track which workspaces have pending continues with their messages
  const pendingContinuesRef = useRef<Map<string, string>>(new Map());

  // Handle compaction start - store continue message and register workspace
  const handleCompactStart = useCallback((workspaceId: string, continueMessage: string) => {
    // Store in localStorage (strongly attached to this compaction)
    localStorage.setItem(getCompactContinueMessageKey(workspaceId), continueMessage);
    // Track that this workspace has a pending continue
    pendingContinuesRef.current.set(workspaceId, continueMessage);
  }, []);

  // Listen for compaction complete events and trigger auto-continue
  useEffect(() => {
    const handleCompactionComplete = async (e: Event) => {
      const customEvent = e as CustomEvent<{ workspaceId: string }>;
      const { workspaceId } = customEvent.detail;

      const continueMessage = pendingContinuesRef.current.get(workspaceId);
      if (!continueMessage) {
        return;
      }

      // Clean up tracking and storage immediately
      pendingContinuesRef.current.delete(workspaceId);
      localStorage.removeItem(getCompactContinueMessageKey(workspaceId));

      // Send the continue message as a new user message
      // Note: We don't pass options so sendMessage will use current workspace settings
      const result = await window.api.workspace.sendMessage(workspaceId, continueMessage);

      if (!result.success) {
        console.error("Failed to send continue message:", result.error);
      }
    };

    window.addEventListener(CUSTOM_EVENTS.COMPACTION_COMPLETE, handleCompactionComplete);
    return () => {
      window.removeEventListener(CUSTOM_EVENTS.COMPACTION_COMPLETE, handleCompactionComplete);
    };
  }, []);

  // Cleanup localStorage on unmount to prevent orphaned state
  useEffect(() => {
    return () => {
      for (const workspaceId of pendingContinuesRef.current.keys()) {
        localStorage.removeItem(getCompactContinueMessageKey(workspaceId));
      }
    };
  }, []);

  return { handleCompactStart };
}
