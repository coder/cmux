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
 *    - EXCEPT: Ignore very recent user messages (< 2s) to prevent flash during normal send flow
 */
export function hasInterruptedStream(messages: DisplayedMessage[]): boolean {
  if (messages.length === 0) return false;

  const lastMessage = messages[messages.length - 1];

  // For user messages, check if enough time has passed to consider it truly interrupted
  // This prevents the retry barrier from flashing briefly when sending a message
  if (lastMessage.type === "user") {
    const messageAge = Date.now() - (lastMessage.timestamp ?? 0);
    const MIN_AGE_FOR_INTERRUPT = 2000; // 2 seconds
    return messageAge >= MIN_AGE_FOR_INTERRUPT;
  }

  return (
    lastMessage.type === "stream-error" || // Stream errored out
    (lastMessage.type === "assistant" && lastMessage.isPartial === true) ||
    (lastMessage.type === "tool" && lastMessage.isPartial === true) ||
    (lastMessage.type === "reasoning" && lastMessage.isPartial === true)
  );
}
