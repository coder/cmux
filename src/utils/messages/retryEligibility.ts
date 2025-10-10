import type { DisplayedMessage } from "@/types/message";

/**
 * Check if messages contain an interrupted stream that can be retried
 *
 * Used by both:
 * - AIView: To determine if RetryBarrier should be shown
 * - useResumeManager: To determine if workspace is eligible for auto-retry
 *
 * This ensures DRY - both use the same logic for what constitutes a retryable state.
 */
export function hasInterruptedStream(messages: DisplayedMessage[]): boolean {
  if (messages.length === 0) return false;

  const lastMessage = messages[messages.length - 1];

  return (
    lastMessage.type === "stream-error" || // Stream errored out
    (lastMessage.type === "assistant" && lastMessage.isPartial === true) ||
    (lastMessage.type === "tool" && lastMessage.isPartial === true) ||
    (lastMessage.type === "reasoning" && lastMessage.isPartial === true)
  );
}
