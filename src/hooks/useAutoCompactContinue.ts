import { useRef, useEffect } from "react";
import { useWorkspaceStoreRaw, type WorkspaceState } from "@/stores/WorkspaceStore";
import { buildSendMessageOptions } from "@/hooks/useSendMessageOptions";

/**
 * Hook to manage auto-continue after compaction using structured message metadata
 *
 * Approach:
 * - Watches all workspaces for single compacted message (compaction just completed)
 * - Reads continueMessage from the summary message's compaction-result metadata
 * - Sends continue message automatically
 *
 * Why summary metadata? When compaction completes, history is replaced with just the
 * summary message. The original compaction-request message is deleted. To preserve
 * the continueMessage across this replacement, we extract it before replacement and
 * store it in the summary's metadata.
 *
 * Self-contained: No callback needed. Hook detects condition and handles action.
 * No localStorage - metadata is the single source of truth.
 *
 * IMPORTANT: sendMessage options (model, thinking level, mode, etc.) are managed by the
 * frontend via buildSendMessageOptions. The backend does NOT fall back to workspace
 * metadata - frontend must pass complete options.
 */
export function useAutoCompactContinue() {
  // Get workspace states from store
  // NOTE: We use a ref-based approach instead of useSyncExternalStore to avoid
  // re-rendering AppInner on every workspace state change. This hook only needs
  // to react when messages change to a single compacted message state.
  const store = useWorkspaceStoreRaw();
  const workspaceStatesRef = useRef<Map<string, WorkspaceState>>(new Map());

  // Prevent duplicate auto-sends if effect runs more than once while the same
  // compacted summary is visible (e.g., rapid state updates after replaceHistory)
  const firedForWorkspace = useRef<Set<string>>(new Set());

  // Update ref and check for auto-continue condition
  const checkAutoCompact = () => {
    const newStates = store.getAllStates();
    workspaceStatesRef.current = newStates;

    // Check all workspaces for completed compaction
    for (const [workspaceId, state] of newStates) {
      // Reset guard when compaction is no longer in the single-compacted-message state
      const isSingleCompacted =
        state.messages.length === 1 &&
        state.messages[0].type === "assistant" &&
        state.messages[0].isCompacted === true;

      if (!isSingleCompacted) {
        // Allow future auto-continue for this workspace when next compaction completes
        firedForWorkspace.current.delete(workspaceId);
        continue;
      }

      // Only proceed once per compaction completion
      if (firedForWorkspace.current.has(workspaceId)) continue;

      // After compaction, history is replaced with a single summary message
      // The summary message has compaction-result metadata with the continueMessage
      const summaryMessage = state.cmuxMessages[0]; // Single compacted message
      const cmuxMeta = summaryMessage?.metadata?.cmuxMetadata;
      const continueMessage =
        cmuxMeta?.type === "compaction-result" ? cmuxMeta.continueMessage : undefined;

      if (!continueMessage) continue;

      // Mark as fired BEFORE any async operations to prevent race conditions
      // This MUST come immediately after checking continueMessage to ensure
      // only one of multiple concurrent checkAutoCompact() runs can proceed
      if (firedForWorkspace.current.has(workspaceId)) continue; // Double-check
      firedForWorkspace.current.add(workspaceId);

      console.log(
        `[useAutoCompactContinue] Sending continue message for ${workspaceId}:`,
        continueMessage
      );

      // Build options and send message directly
      const options = buildSendMessageOptions(workspaceId);
      window.api.workspace.sendMessage(workspaceId, continueMessage, options).catch((error) => {
        console.error("Failed to send continue message:", error);
        // If sending failed, allow another attempt on next render by clearing the guard
        firedForWorkspace.current.delete(workspaceId);
      });
    }
  };

  useEffect(() => {
    // Initial check
    checkAutoCompact();

    // Subscribe to store changes and check condition
    // This doesn't trigger React re-renders, just our internal check
    const unsubscribe = store.subscribe(() => {
      checkAutoCompact();
    });

    return unsubscribe;
  }, [store]); // eslint-disable-line react-hooks/exhaustive-deps
}
