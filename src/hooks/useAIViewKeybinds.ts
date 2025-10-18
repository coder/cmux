import { useEffect } from "react";
import type { ChatInputAPI } from "@/components/ChatInput";
import { matchesKeybind, KEYBINDS, isEditableElement } from "@/utils/ui/keybinds";
import { getLastThinkingByModelKey, getModelKey } from "@/constants/storage";
import { updatePersistedState, readPersistedState } from "@/hooks/usePersistedState";
import type { ThinkingLevel, ThinkingLevelOn } from "@/types/thinking";
import { DEFAULT_THINKING_LEVEL } from "@/types/thinking";
import { getThinkingPolicyForModel } from "@/utils/thinking/policy";
import { getDefaultModelFromLRU } from "@/hooks/useModelLRU";
import type { StreamingMessageAggregator } from "@/utils/messages/StreamingMessageAggregator";
import { isCompactingStream, cancelCompaction } from "@/utils/compaction/handler";

interface UseAIViewKeybindsParams {
  workspaceId: string;
  currentModel: string | null;
  canInterrupt: boolean;
  showRetryBarrier: boolean;
  currentWorkspaceThinking: ThinkingLevel;
  setThinkingLevel: (level: ThinkingLevel) => void;
  setAutoRetry: (value: boolean) => void;
  chatInputAPI: React.RefObject<ChatInputAPI | null>;
  jumpToBottom: () => void;
  handleOpenTerminal: () => void;
  aggregator: StreamingMessageAggregator; // For compaction detection
}

/**
 * Manages keyboard shortcuts for AIView:
 * - Escape: Interrupt stream
 * - Ctrl+I: Focus chat input
 * - Ctrl+Shift+T: Toggle thinking level
 * - Ctrl+G: Jump to bottom
 * - Ctrl+T: Open terminal
 */
export function useAIViewKeybinds({
  workspaceId,
  currentModel,
  canInterrupt,
  showRetryBarrier,
  currentWorkspaceThinking,
  setThinkingLevel,
  setAutoRetry,
  chatInputAPI,
  jumpToBottom,
  handleOpenTerminal,
  aggregator,
}: UseAIViewKeybindsParams): void {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+C during compaction: cancel and restore command to input
      if (matchesKeybind(e, KEYBINDS.INTERRUPT_STREAM)) {
        e.preventDefault();
        
        if (canInterrupt && isCompactingStream(aggregator)) {
          // Special handling for compaction: delete messages and restore command
          void cancelCompaction(workspaceId, aggregator, (command) => {
            chatInputAPI.current?.restoreText(command);
          });
          setAutoRetry(false);
          return;
        }
        
        // Normal stream interrupt
        if (canInterrupt || showRetryBarrier) {
          setAutoRetry(false); // User explicitly stopped - don't auto-retry
          void window.api.workspace.interruptStream(workspaceId);
        }
        return;
      }

      // Ctrl+A during compaction: accept early with [truncated] sentinel
      if (matchesKeybind(e, KEYBINDS.ACCEPT_EARLY_COMPACTION)) {
        e.preventDefault();
        
        if (canInterrupt && isCompactingStream(aggregator)) {
          // Interrupt stream - this triggers handleCompactionAbort in WorkspaceStore
          setAutoRetry(false);
          void window.api.workspace.interruptStream(workspaceId);
        }
        return;
      }

      // Focus chat input works anywhere (even in input fields)
      if (matchesKeybind(e, KEYBINDS.FOCUS_CHAT)) {
        e.preventDefault();
        chatInputAPI.current?.focus();
        return;
      }

      // Toggle thinking works even when focused in input fields
      if (matchesKeybind(e, KEYBINDS.TOGGLE_THINKING)) {
        e.preventDefault();

        // Get selected model from localStorage (what user sees in UI)
        // Fall back to message history model, then to most recent model from LRU
        // This matches the same logic as useSendMessageOptions
        const selectedModel = readPersistedState<string | null>(getModelKey(workspaceId), null);
        const modelToUse = selectedModel ?? currentModel ?? getDefaultModelFromLRU();

        // Storage key for remembering this model's last-used active thinking level
        const lastThinkingKey = getLastThinkingByModelKey(modelToUse);

        // Special-case: if model has single-option policy (e.g., gpt-5-pro only supports HIGH),
        // the toggle is a no-op to avoid confusing state transitions.
        const allowed = getThinkingPolicyForModel(modelToUse);
        if (allowed.length === 1) {
          return; // No toggle for single-option policies
        }

        if (currentWorkspaceThinking !== "off") {
          // Thinking is currently ON - save the level for this model and turn it off
          // Type system ensures we can only store active levels (not "off")
          const activeLevel: ThinkingLevelOn = currentWorkspaceThinking;
          updatePersistedState(lastThinkingKey, activeLevel);
          setThinkingLevel("off");
        } else {
          // Thinking is currently OFF - restore the last level used for this model
          const lastUsedThinkingForModel = readPersistedState<ThinkingLevelOn>(
            lastThinkingKey,
            DEFAULT_THINKING_LEVEL
          );
          setThinkingLevel(lastUsedThinkingForModel);
        }
        return;
      }

      // Don't handle other shortcuts if user is typing in an input field
      if (isEditableElement(e.target)) {
        return;
      }

      if (matchesKeybind(e, KEYBINDS.JUMP_TO_BOTTOM)) {
        e.preventDefault();
        jumpToBottom();
      } else if (matchesKeybind(e, KEYBINDS.OPEN_TERMINAL)) {
        e.preventDefault();
        handleOpenTerminal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    jumpToBottom,
    handleOpenTerminal,
    workspaceId,
    canInterrupt,
    showRetryBarrier,
    setAutoRetry,
    currentModel,
    currentWorkspaceThinking,
    setThinkingLevel,
    chatInputAPI,
    aggregator,
  ]);
}
