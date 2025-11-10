import type { RetryState } from "@/hooks/useResumeManager";

export const INITIAL_DELAY = 1000; // 1 second

/**
 * Utility functions for managing retry state
 *
 * These functions encapsulate retry state transitions to prevent bugs
 * like bypassing exponential backoff.
 */

/**
 * Create a fresh retry state (for new stream starts)
 *
 * Use this when a stream starts successfully - resets backoff completely.
 */
export function createFreshRetryState(): RetryState {
  return {
    attempt: 0,
    retryStartTime: Date.now(),
  };
}

/**
 * Create retry state for manual retry (user-initiated)
 *
 * Makes the retry immediately eligible BUT preserves the attempt counter
 * to maintain backoff progression if the retry fails.
 *
 * This prevents infinite retry loops without backoff.
 *
 * @param currentAttempt - Current attempt count to preserve backoff progression
 */
export function createManualRetryState(currentAttempt: number): RetryState {
  return {
    attempt: currentAttempt,
    retryStartTime: Date.now() - INITIAL_DELAY, // Make immediately eligible
    lastError: undefined, // Clear error (user is manually retrying)
  };
}

/**
 * Create retry state after a failed attempt
 *
 * Increments attempt counter and records the error for display.
 *
 * @param previousAttempt - Previous attempt count
 * @param error - Error that caused the failure
 */
export function createFailedRetryState(
  previousAttempt: number,
  error: RetryState["lastError"]
): RetryState {
  return {
    attempt: previousAttempt + 1,
    retryStartTime: Date.now(),
    lastError: error,
  };
}
