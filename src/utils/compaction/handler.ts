/**
 * Compaction interrupt handling
 *
 * Consolidated logic for handling Ctrl+C and Ctrl+A during compaction streams.
 */

import type { StreamingMessageAggregator } from "@/utils/messages/StreamingMessageAggregator";

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
 * Cancel compaction: interrupt stream, restore state before compaction
 * 
 * This removes both the compaction request user message and the partial assistant summary,
 * leaving the history as it was before /compact was invoked.
 */
export async function cancelCompaction(
  workspaceId: string,
  aggregator: StreamingMessageAggregator,
  restoreCommandToInput: (command: string) => void
): Promise<boolean> {
  // Get the command before we modify history
  const command = getCompactionCommand(aggregator);
  if (!command) {
    return false;
  }

  // Get all messages before interrupting
  const messages = aggregator.getAllMessages();
  
  // Find the compaction request message
  const compactionRequestIndex = messages.findIndex(
    (m) => m.role === "user" && m.metadata?.cmuxMetadata?.type === "compaction-request"
  );
  
  if (compactionRequestIndex === -1) {
    return false;
  }

  // Interrupt the stream first
  await window.api.workspace.interruptStream(workspaceId);

  // Calculate percentage to keep: everything before the compaction request
  // After interrupt, we have: [...history, compactionRequest, partialSummary]
  // We want to keep: [...history]
  const totalMessages = messages.length + 1; // +1 for partial summary that will be committed
  const messagesToKeep = compactionRequestIndex;
  const percentageToKeep = messagesToKeep / totalMessages;

  // Truncate to remove compaction request + partial summary
  await window.api.workspace.truncateHistory(workspaceId, percentageToKeep);

  // Restore command to input
  restoreCommandToInput(command);

  return true;
}

