import type { DisplayedMessage } from "@/types/message";
import type { StreamErrorType, SendMessageError } from "@/types/errors";

/**
 * Debug flag to force all errors to be retryable
 * Set in browser console: window.__CMUX_FORCE_ALL_RETRYABLE = true
 *
 * Useful for testing retry/backoff logic without needing to simulate
 * specific network conditions or rate limits.
 *
 * Note: If you set this flag after an error occurs, you may need to
 * trigger a manual retry first (click "Retry" button) to clear the
 * stored non-retryable error state.
 */
declare global {
  interface Window {
    __CMUX_FORCE_ALL_RETRYABLE?: boolean;
  }
}

/**
 * Error types that should NOT be auto-retried because they require user action
 * These errors won't resolve on their own - the user must fix the underlying issue
 */
const NON_RETRYABLE_STREAM_ERRORS: StreamErrorType[] = [
  "authentication", // Bad API key - user must fix credentials
  "quota", // Billing/usage limits - user must upgrade or wait for reset
  "model_not_found", // Invalid model - user must select different model
  "context_exceeded", // Message too long - user must reduce context
  "aborted", // User cancelled - should not auto-retry
];

/**
 * Check if a SendMessageError (from resumeStream failures) is non-retryable
 */
export function isNonRetryableSendError(error: SendMessageError): boolean {
  // Debug flag: force all errors to be retryable
  if (window.__CMUX_FORCE_ALL_RETRYABLE) {
    console.log("[retry] __CMUX_FORCE_ALL_RETRYABLE enabled, treating error as retryable:", error);
    return false;
  }

  let isNonRetryable = false;
  switch (error.type) {
    case "api_key_not_found": // Missing API key - user must configure
    case "provider_not_supported": // Unsupported provider - user must switch
    case "invalid_model_string": // Bad model format - user must fix
      isNonRetryable = true;
      break;
    case "unknown":
      isNonRetryable = false; // Unknown errors might be transient
      break;
  }

  // Only log when debug flag is set or when dealing with non-retryable errors
  if (window.__CMUX_FORCE_ALL_RETRYABLE || isNonRetryable) {
    console.log("[retry] isNonRetryableSendError:", {
      errorType: error.type,
      isNonRetryable,
      debugFlag: window.__CMUX_FORCE_ALL_RETRYABLE,
    });
  }

  return isNonRetryable;
}

/**
 * Check if messages contain an interrupted stream
 *
 * Used by AIView to determine if RetryBarrier should be shown.
 * Shows retry UI for ALL interrupted streams, including non-retryable errors
 * (so users can manually retry after fixing the issue).
 *
 * Returns true if:
 * 1. Last message is a stream-error (any type - user may have fixed the issue)
 * 2. Last message is a partial assistant/tool/reasoning message
 * 3. Last message is a user message (indicating we sent it but never got a response)
 *    - This handles app restarts during slow model responses (models can take 30-60s to first token)
 *    - User messages are only at the end when response hasn't started/completed
 *    - EXCEPT: Not if recently sent (<3s ago) - prevents flash during normal send flow
 */
export function hasInterruptedStream(
  messages: DisplayedMessage[],
  pendingStreamStartTime: number | null = null
): boolean {
  if (messages.length === 0) return false;

  // Don't show retry barrier if user message was sent very recently (< 3s)
  // This prevents flash during normal send flow while stream-start event arrives
  // After 3s, we assume something is wrong and show the barrier
  if (pendingStreamStartTime !== null) {
    const elapsed = Date.now() - pendingStreamStartTime;
    if (elapsed < 3000) return false;
  }

  const lastMessage = messages[messages.length - 1];

  return (
    lastMessage.type === "stream-error" || // Stream errored out (show UI for ALL error types)
    lastMessage.type === "user" || // No response received yet (app restart during slow model)
    (lastMessage.type === "assistant" && lastMessage.isPartial === true) ||
    (lastMessage.type === "tool" && lastMessage.isPartial === true) ||
    (lastMessage.type === "reasoning" && lastMessage.isPartial === true)
  );
}

/**
 * Check if messages are eligible for automatic retry
 *
 * Used by useResumeManager to determine if workspace should be auto-retried.
 * Returns false for errors that require user action (authentication, quota, etc.),
 * but still allows manual retry via RetryBarrier UI.
 *
 * This separates auto-retry logic from manual retry UI:
 * - Manual retry: Always available for any error (hasInterruptedStream)
 * - Auto retry: Only for transient errors that might resolve on their own
 */
export function isEligibleForAutoRetry(
  messages: DisplayedMessage[],
  pendingStreamStartTime: number | null = null
): boolean {
  // First check if there's an interrupted stream at all
  if (!hasInterruptedStream(messages, pendingStreamStartTime)) {
    if (window.__CMUX_FORCE_ALL_RETRYABLE) {
      console.log("[retry] No interrupted stream detected");
    }
    return false;
  }

  // If the last message is a non-retryable error, don't auto-retry
  // (but manual retry is still available via hasInterruptedStream)
  const lastMessage = messages[messages.length - 1];
  if (lastMessage.type === "stream-error") {
    // Debug flag: force all errors to be retryable
    if (window.__CMUX_FORCE_ALL_RETRYABLE) {
      console.log("[retry] __CMUX_FORCE_ALL_RETRYABLE enabled, stream-error is retryable:", lastMessage.errorType);
      return true;
    }
    const isRetryable = !NON_RETRYABLE_STREAM_ERRORS.includes(lastMessage.errorType);
    if (window.__CMUX_FORCE_ALL_RETRYABLE) {
      console.log("[retry] Stream error eligibility:", {
        errorType: lastMessage.errorType,
        isRetryable,
        debugFlag: window.__CMUX_FORCE_ALL_RETRYABLE,
      });
    }
    return isRetryable;
  }

  // Other interrupted states (partial messages, user messages) are auto-retryable
  if (window.__CMUX_FORCE_ALL_RETRYABLE) {
    console.log("[retry] Other interrupted state (partial/user message), eligible for auto-retry");
  }
  return true;
}
