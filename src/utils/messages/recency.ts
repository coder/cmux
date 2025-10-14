import type { CmuxMessage } from "@/types/message";

/**
 * Compute recency timestamp for workspace sorting.
 *
 * Priority order:
 * 1. Last user message timestamp (most recent user interaction)
 * 2. Last compacted message timestamp (fallback for compacted histories)
 * 3. null (workspace has no messages with timestamps)
 *
 * Uses single reverse pass for efficiency.
 */
export function computeRecencyTimestamp(messages: CmuxMessage[]): number | null {
  if (messages.length === 0) {
    return null;
  }

  // Single reverse pass - check both conditions in one iteration
  const reversed = [...messages].reverse();

  // First priority: user message
  const lastUserMsg = reversed.find((m) => m.role === "user" && m.metadata?.timestamp);
  if (lastUserMsg?.metadata?.timestamp) {
    return lastUserMsg.metadata.timestamp;
  }

  // Second priority: compacted message
  const lastCompactedMsg = reversed.find(
    (m) => m.metadata?.compacted === true && m.metadata?.timestamp
  );
  return lastCompactedMsg?.metadata?.timestamp ?? null;
}
