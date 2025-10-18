/**
 * Compaction interrupt handling
 *
 * Two interrupt flows during compaction:
 * - Ctrl+C (cancel): Abort compaction, restore original history + command to input
 * - Ctrl+A (accept early): Complete compaction with [truncated] sentinel
 */

import type { StreamingMessageAggregator } from "@/utils/messages/StreamingMessageAggregator";
import type { WorkspaceStore } from "@/stores/WorkspaceStore";

/**
 * Check if the workspace is currently in a compaction stream
 */
export function isCompactingStream(aggregator: StreamingMessageAggregator): boolean {
  const messages = aggregator.getAllMessages();
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  return lastUserMsg?.metadata?.cmuxMetadata?.type === "compaction-request";
}

/**
 * Get the original /compact command from the last user message
 */
export function getCompactionCommand(aggregator: StreamingMessageAggregator): string | null {
  const messages = aggregator.getAllMessages();
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");

  if (lastUserMsg?.metadata?.cmuxMetadata?.type !== "compaction-request") {
    return null;
  }

  return lastUserMsg.metadata.cmuxMetadata.rawCommand ?? null;
}

/**
 * Cancel compaction (Ctrl+C flow)
 * 
 * Aborts the compaction stream and restores state to before /compact was invoked:
 * - Interrupts stream without performing compaction (via flag)
 * - Removes compaction request + partial summary from history
 * - Restores original /compact command to input for re-editing
 * 
 * Flow:
 * 1. Set flag in WorkspaceStore to prevent handleCompactionAbort from compacting
 * 2. Interrupt stream (triggers StreamAbortEvent)
 * 3. handleCompactionAbort sees flag, skips compaction, cleans up flag
 * 4. Truncate history to remove compaction request + partial summary
 * 5. Restore command to input
 */
export async function cancelCompaction(
  workspaceId: string,
  aggregator: StreamingMessageAggregator,
  workspaceStore: WorkspaceStore,
  restoreCommandToInput: (command: string) => void
): Promise<boolean> {
  // Extract command before modifying history
  const command = getCompactionCommand(aggregator);
  if (!command) {
    return false;
  }

  // Get messages snapshot before interrupting
  const messages = aggregator.getAllMessages();
  
  // Find where compaction request is located
  const compactionRequestIndex = messages.findIndex(
    (m) => m.role === "user" && m.metadata?.cmuxMetadata?.type === "compaction-request"
  );
  
  if (compactionRequestIndex === -1) {
    return false;
  }

  // CRITICAL: Mark workspace as cancelling BEFORE interrupt
  // This tells handleCompactionAbort to skip compaction (Ctrl+C path vs Ctrl+A path)
  workspaceStore.markCompactionCancelling(workspaceId);

  // Interrupt stream - triggers StreamAbortEvent → handleCompactionAbort
  // handleCompactionAbort will see the flag and skip performCompaction
  await window.api.workspace.interruptStream(workspaceId);

  // Calculate truncation: keep everything before compaction request
  // After interrupt: [...history, compactionRequest, partialSummary]
  // We want: [...history]
  const totalMessages = messages.length + 1; // +1 for partial summary committed by interrupt
  const percentageToKeep = compactionRequestIndex / totalMessages;

  // Truncate history to remove compaction artifacts
  await window.api.workspace.truncateHistory(workspaceId, percentageToKeep);

  // Restore command to input so user can edit and retry
  restoreCommandToInput(command);

  return true;
}

