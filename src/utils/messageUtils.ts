import type { CmuxMessage, CmuxTextPart, DisplayedMessage } from "../types/message";

/**
 * Extracts text content from message parts
 */
export function extractTextContent(message: CmuxMessage): string {
  return message.parts
    .filter((p): p is CmuxTextPart => p.type === "text")
    .map((p) => p.text || "")
    .join("");
}

/**
 * Determines if the interrupted barrier should be shown for a DisplayedMessage.
 *
 * The barrier should show when:
 * - Assistant messages: Was interrupted (isPartial) AND not currently streaming
 * - Tool messages: Parent message was interrupted (isPartial)
 *
 * The barrier should NOT show during active streaming.
 */
export function shouldShowInterruptedBarrier(msg: DisplayedMessage): boolean {
  // User messages never show interrupted barrier
  if (msg.type === "user" || msg.type === "reasoning") {
    return false;
  }

  // Only show on the last part of multi-part messages
  if (!msg.isLastPartOfMessage) {
    return false;
  }

  if (msg.type === "assistant") {
    // Show only if message was interrupted and is no longer streaming
    return msg.isPartial && !msg.isStreaming;
  }

  if (msg.type === "tool") {
    // Show if parent message was interrupted, regardless of individual tool status
    return msg.isPartial;
  }

  return false;
}

/**
 * Type guard to check if a message part has a streaming state
 */
export function isStreamingPart(part: unknown): part is { type: "text"; state: "streaming" } {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    part.type === "text" &&
    "state" in part &&
    part.state === "streaming"
  );
}

/**
 * Checks if a message is currently streaming
 */
export function isStreamingMessage(message: CmuxMessage): boolean {
  return message.parts.some(isStreamingPart);
}
