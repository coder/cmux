import { useRef, useEffect } from "react";
import { useWorkspaceStoreRaw, type WorkspaceState } from "@/stores/WorkspaceStore";
import { buildSendMessageOptions } from "@/hooks/useSendMessageOptions";

/**
 * Hook to manage auto-continue after compaction using structured message metadata
 *
 * Approach:
 * - Watches all workspaces for single compacted message (compaction just completed)
 * - Finds the compaction request message in history with structured metadata
 * - Extracts continueMessage from metadata.parsed.continueMessage
 * - Sends continue message automatically
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

      // Find the most recent compaction request message from the raw message list
      const compactRequestMessage = [...state.cmuxMessages]
        .reverse()
        .find(
          (msg) => msg.role === "user" && msg.metadata?.cmuxMetadata?.type === "compaction-request"
        );

      if (compactRequestMessage) {
        const cmuxMeta = compactRequestMessage.metadata?.cmuxMetadata;
        if (cmuxMeta?.type === "compaction-request") {
          const continueMessage = cmuxMeta.parsed.continueMessage;

          if (continueMessage) {
            // Mark as fired immediately to avoid re-entry on rapid renders
            firedForWorkspace.current.add(workspaceId);

            // Build options and send message directly
            const options = buildSendMessageOptions(workspaceId);
            window.api.workspace
              .sendMessage(workspaceId, continueMessage, options)
              .catch((error) => {
                console.error("Failed to send continue message:", error);
                // If sending failed, allow another attempt on next render by clearing the guard
                firedForWorkspace.current.delete(workspaceId);
              });
          }
        }
      }
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
