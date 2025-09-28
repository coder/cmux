import type { CmuxMessage } from "../types/message";

/**
 * Extracts text content from message parts
 */
export function extractTextContent(message: CmuxMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text || "")
    .join("");
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
