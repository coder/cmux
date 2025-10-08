"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractTextContent = extractTextContent;
exports.shouldShowInterruptedBarrier = shouldShowInterruptedBarrier;
exports.isStreamingPart = isStreamingPart;
exports.isStreamingMessage = isStreamingMessage;
/**
 * Extracts text content from message parts
 */
function extractTextContent(message) {
    return message.parts
        .filter((p) => p.type === "text")
        .map((p) => p.text || "")
        .join("");
}
/**
 * Determines if the interrupted barrier should be shown for a DisplayedMessage.
 *
 * The barrier should show when:
 * - Message was interrupted (isPartial) AND not currently streaming
 * - For multi-part messages, only show on the last part
 */
function shouldShowInterruptedBarrier(msg) {
    if (msg.type === "user" || msg.type === "stream-error" || msg.type === "history-hidden")
        return false;
    // Only show on the last part of multi-part messages
    if (!msg.isLastPartOfMessage)
        return false;
    // Show if interrupted and not actively streaming (tools don't have isStreaming property)
    const isStreaming = "isStreaming" in msg ? msg.isStreaming : false;
    return msg.isPartial && !isStreaming;
}
/**
 * Type guard to check if a message part has a streaming state
 */
function isStreamingPart(part) {
    return (typeof part === "object" &&
        part !== null &&
        "type" in part &&
        part.type === "text" &&
        "state" in part &&
        part.state === "streaming");
}
/**
 * Checks if a message is currently streaming
 */
function isStreamingMessage(message) {
    return message.parts.some(isStreamingPart);
}
//# sourceMappingURL=messageUtils.js.map