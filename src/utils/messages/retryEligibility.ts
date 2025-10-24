import type { DisplayedMessage } from "@/types/message";

/**
 * Check if messages contain an interrupted stream that can be retried
 *
 * Used by both:
 * - AIView: To determine if RetryBarrier should be shown
 * - useResumeManager: To determine if workspace is eligible for auto-retry
 *
 * This ensures DRY - both use the same logic for what constitutes a retryable state.
 *
 * Returns true if:
 * 1. Last message is a stream-error
 * 2. Last message is a partial assistant/tool/reasoning message
 * 3. Last message is a user message (indicating we sent it but never got a response)
 *    - This handles app restarts during slow model responses (models can take 30-60s to first token)
 *    - User messages are only at the end when response hasn't started/completed
 *    - EXCEPT: Not if pendingStreamStart is true (waiting for stream-start event)
 */
export function hasInterruptedStream(
  messages: DisplayedMessage[],
  pendingStreamStart = false
): boolean {
  if (messages.length === 0) return false;

  // Don't show retry barrier if we're waiting for stream-start
  // This prevents flash during normal send flow
  if (pendingStreamStart) return false;

  const lastMessage = messages[messages.length - 1];

  return (
    lastMessage.type === "stream-error" || // Stream errored out
    lastMessage.type === "user" || // No response received yet (app restart during slow model)
    (lastMessage.type === "assistant" && lastMessage.isPartial === true) ||
    (lastMessage.type === "tool" && lastMessage.isPartial === true) ||
    (lastMessage.type === "reasoning" && lastMessage.isPartial === true)
  );
}
