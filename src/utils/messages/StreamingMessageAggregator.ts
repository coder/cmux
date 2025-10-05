import type { CmuxMessage, CmuxMetadata, DisplayedMessage } from "../types/message";
import { createCmuxMessage } from "../types/message";
import type {
  StreamStartEvent,
  StreamDeltaEvent,
  StreamEndEvent,
  StreamAbortEvent,
  ToolCallStartEvent,
  ToolCallDeltaEvent,
  ToolCallEndEvent,
  ReasoningDeltaEvent,
  ReasoningEndEvent,
} from "../types/stream";
import type { WorkspaceChatMessage, StreamErrorMessage, DeleteMessage } from "../types/ipc";
import type {
  DynamicToolPart,
  DynamicToolPartPending,
  DynamicToolPartAvailable,
} from "../types/toolParts";
import { isDynamicToolPart } from "../types/toolParts";

interface StreamingContext {
  startTime: number;
  isComplete: boolean;
}

/**
 * StreamingMessageAggregator - Simplified for User/Assistant Messages Only
 *
 * PURPOSE:
 * This class aggregates messages and handles streaming state for a simple
 * chat interface with only user and assistant messages.
 *
 * RULES:
 * 1. NO FORMATTING: Do not add emojis, format text, or create display strings
 * 2. NO PRESENTATION LOGIC: Do not make decisions about how messages should look
 * 3. RAW DATA ONLY: Store messages as close to their original format as possible
 * 4. STRUCTURE ONLY: Only transform data structure (e.g., streaming to final messages)
 */
export class StreamingMessageAggregator {
  private messages = new Map<string, CmuxMessage>();
  private activeStreams = new Map<string, StreamingContext>();
  private streamSequenceCounter = 0; // For ordering parts within a streaming message

  // Cache for getAllMessages() to maintain stable array references
  private cachedMessages: CmuxMessage[] | null = null;

  // Invalidate cache on any mutation
  private invalidateCache(): void {
    this.cachedMessages = null;
  }

  addMessage(message: CmuxMessage): void {
    // Just store the message - backend assigns historySequence
    this.messages.set(message.id, message);
    this.invalidateCache();
  }

  /**
   * Load historical messages in batch, preserving their historySequence numbers.
   * This is more efficient than calling addMessage() repeatedly.
   */
  loadHistoricalMessages(messages: CmuxMessage[]): void {
    for (const message of messages) {
      this.messages.set(message.id, message);
    }
    this.invalidateCache();
  }

  getAllMessages(): CmuxMessage[] {
    if (this.cachedMessages) {
      return this.cachedMessages;
    }

    this.cachedMessages = Array.from(this.messages.values()).sort(
      (a, b) => (a.metadata?.historySequence ?? 0) - (b.metadata?.historySequence ?? 0)
    );
    return this.cachedMessages;
  }

  // Efficient methods to check message state without creating arrays
  getMessageCount(): number {
    return this.messages.size;
  }

  hasMessages(): boolean {
    return this.messages.size > 0;
  }

  getActiveStreams(): StreamingContext[] {
    return Array.from(this.activeStreams.values());
  }

  clear(): void {
    this.messages.clear();
    this.activeStreams.clear();
    this.streamSequenceCounter = 0;
    this.invalidateCache();
  }

  /**
   * Remove messages with specific historySequence numbers
   * Used when backend truncates history
   */
  handleDeleteMessage(deleteMsg: DeleteMessage): void {
    const sequencesToDelete = new Set(deleteMsg.historySequences);

    // Remove messages that match the historySequence numbers
    for (const [messageId, message] of this.messages.entries()) {
      const historySeq = message.metadata?.historySequence;
      if (historySeq !== undefined && sequencesToDelete.has(historySeq)) {
        this.messages.delete(messageId);
      }
    }

    this.invalidateCache();
  }

  // Unified event handlers that encapsulate all complex logic
  handleStreamStart(data: StreamStartEvent): void {
    const context: StreamingContext = {
      startTime: Date.now(),
      isComplete: false,
    };

    // Use messageId as key - ensures only ONE stream per message
    // If called twice (e.g., during replay), second call safely overwrites first
    this.activeStreams.set(data.messageId, context);

    // Create initial streaming message with empty parts (deltas will append)
    const streamingMessage = createCmuxMessage(data.messageId, "assistant", "", {
      historySequence: data.historySequence,
      timestamp: Date.now(),
      model: data.model,
    });

    this.messages.set(data.messageId, streamingMessage);
    this.invalidateCache();
  }

  handleStreamDelta(data: StreamDeltaEvent): void {
    const message = this.messages.get(data.messageId);
    if (!message) return;

    // Append each delta as a new part (merging happens at display time)
    message.parts.push({
      type: "text",
      text: data.delta,
    });
    this.invalidateCache();
  }

  handleStreamEnd(data: StreamEndEvent): void {
    // Direct lookup by messageId - O(1) instead of O(n) find
    const activeStream = this.activeStreams.get(data.messageId);

    if (activeStream) {
      // Normal streaming case: we've been tracking this stream from the start
      const message = this.messages.get(data.messageId);
      if (message?.metadata) {
        // Transparent metadata merge - backend fields flow through automatically
        const updatedMetadata: CmuxMetadata = {
          ...message.metadata,
          ...data.metadata,
          duration: Date.now() - activeStream.startTime,
        };
        message.metadata = updatedMetadata;

        // Update tool parts with their results if provided
        if (data.parts) {
          // Sync up the tool results from the backend's parts array
          for (const backendPart of data.parts) {
            if (backendPart.type === "dynamic-tool") {
              // Find and update existing tool part
              const toolPart = message.parts.find(
                (part): part is DynamicToolPart =>
                  part.type === "dynamic-tool" &&
                  (part as DynamicToolPart).toolCallId === backendPart.toolCallId
              );
              if (toolPart) {
                // Update with result from backend
                (toolPart as DynamicToolPartAvailable).output = backendPart.output;
                (toolPart as DynamicToolPartAvailable).state = "output-available";
              }
            }
          }
        }
      }

      // Clean up active stream - direct delete by messageId
      this.activeStreams.delete(data.messageId);
    } else {
      // Reconnection case: user reconnected after stream completed
      // We reconstruct the entire message from the stream-end event
      // The backend now sends us the parts array with proper temporal ordering
      // Backend MUST provide historySequence in metadata

      // Create the complete message
      const message: CmuxMessage = {
        id: data.messageId,
        role: "assistant",
        metadata: {
          ...data.metadata,
          timestamp: Date.now(),
        },
        parts: data.parts,
      };

      this.messages.set(data.messageId, message);
    }
    this.invalidateCache();
  }

  handleStreamAbort(data: StreamAbortEvent): void {
    // Direct lookup by messageId
    const activeStream = this.activeStreams.get(data.messageId);

    if (activeStream) {
      // Mark the message as interrupted
      const message = this.messages.get(data.messageId);
      if (message?.metadata) {
        message.metadata.partial = true;
      }

      // Clean up active stream - direct delete by messageId
      this.activeStreams.delete(data.messageId);
      this.invalidateCache();
    }
  }

  handleStreamError(data: StreamErrorMessage): void {
    // Direct lookup by messageId
    const activeStream = this.activeStreams.get(data.messageId);

    if (activeStream) {
      // Mark the message with error metadata
      const message = this.messages.get(data.messageId);
      if (message?.metadata) {
        message.metadata.partial = true;
        message.metadata.error = data.error;
        message.metadata.errorType = data.errorType;
      }

      // Clean up active stream - direct delete by messageId
      this.activeStreams.delete(data.messageId);
      this.invalidateCache();
    }
  }

  handleToolCallStart(data: ToolCallStartEvent): void {
    const message = this.messages.get(data.messageId);
    if (!message) return;

    // Check if this tool call already exists to prevent duplicates
    const existingToolPart = message.parts.find(
      (part): part is DynamicToolPart =>
        part.type === "dynamic-tool" && (part as DynamicToolPart).toolCallId === data.toolCallId
    );

    if (existingToolPart) {
      console.warn(`Tool call ${data.toolCallId} already exists, skipping duplicate`);
      return;
    }

    // Add tool part to maintain temporal order
    const toolPart: DynamicToolPartPending = {
      type: "dynamic-tool",
      toolCallId: data.toolCallId,
      toolName: data.toolName,
      state: "input-available",
      input: data.args,
    };
    message.parts.push(toolPart as never);
    this.invalidateCache();
  }

  handleToolCallDelta(_data: ToolCallDeltaEvent): void {
    // Tool deltas could be handled here if needed for streaming tool results
    // For now, we wait for the complete result in handleToolCallEnd
  }

  handleToolCallEnd(data: ToolCallEndEvent): void {
    const message = this.messages.get(data.messageId);
    if (message) {
      // Find the specific tool part by its ID and update it with the result
      // We don't move it - it stays in its original temporal position
      const toolPart = message.parts.find(
        (part): part is DynamicToolPart =>
          part.type === "dynamic-tool" && part.toolCallId === data.toolCallId
      );
      if (toolPart) {
        // Type assertion needed because TypeScript can't narrow the discriminated union
        (toolPart as DynamicToolPartAvailable).state = "output-available";
        (toolPart as DynamicToolPartAvailable).output = data.result;
      }
      this.invalidateCache();
    }
  }

  handleReasoningDelta(data: ReasoningDeltaEvent): void {
    const message = this.messages.get(data.messageId);
    if (!message) return;

    // Append each delta as a new part (merging happens at display time)
    message.parts.push({
      type: "reasoning",
      text: data.delta,
    });
    this.invalidateCache();
  }

  handleReasoningEnd(_data: ReasoningEndEvent): void {
    // Reasoning-end is just a signal - no state to update
    // Streaming status is inferred from activeStreams in getDisplayedMessages
    this.invalidateCache();
  }

  handleMessage(data: WorkspaceChatMessage): void {
    // Handle regular messages (user messages, historical messages)
    // Check if it's a CmuxMessage (has role property but no type)
    if ("role" in data && !("type" in data)) {
      const incomingMessage = data;

      // Smart replacement logic for edits:
      // If a message arrives with a historySequence that already exists,
      // it means history was truncated (edit operation). Remove the existing
      // message at that sequence and all subsequent messages, then add the new one.
      const incomingSequence = incomingMessage.metadata?.historySequence;
      if (incomingSequence !== undefined) {
        // Check if there's already a message with this sequence
        for (const [_id, msg] of this.messages.entries()) {
          const existingSequence = msg.metadata?.historySequence;
          if (existingSequence !== undefined && existingSequence >= incomingSequence) {
            // Found a conflict - remove this message and all after it
            const messagesToRemove: string[] = [];
            for (const [removeId, removeMsg] of this.messages.entries()) {
              const removeSeq = removeMsg.metadata?.historySequence;
              if (removeSeq !== undefined && removeSeq >= incomingSequence) {
                messagesToRemove.push(removeId);
              }
            }
            for (const removeId of messagesToRemove) {
              this.messages.delete(removeId);
            }
            break; // Found and handled the conflict
          }
        }
      }

      // Now add the new message
      this.addMessage(incomingMessage);
    }
  }

  /**
   * Transform CmuxMessages into DisplayedMessages for UI consumption
   * This splits complex messages with multiple parts into separate UI blocks
   * while preserving temporal ordering through sequence numbers
   */
  getDisplayedMessages(): DisplayedMessage[] {
    const displayedMessages: DisplayedMessage[] = [];

    for (const message of this.getAllMessages()) {
      const baseTimestamp = message.metadata?.timestamp;
      // Get historySequence from backend (required field)
      const historySequence = message.metadata?.historySequence ?? 0;

      if (message.role === "user") {
        // User messages: combine all text parts into single block
        const content = message.parts
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("");

        displayedMessages.push({
          type: "user",
          id: message.id,
          historyId: message.id,
          content,
          historySequence,
          timestamp: baseTimestamp,
        });
      } else if (message.role === "assistant") {
        // Assistant messages: each part becomes a separate DisplayedMessage
        // Use streamSequence to order parts within this message
        let streamSeq = 0;

        // Check if this message has an active stream (for inferring streaming status)
        // Direct Map.has() check - O(1) instead of O(n) iteration
        const hasActiveStream = this.activeStreams.has(message.id);

        // Merge adjacent parts of same type (text with text, reasoning with reasoning)
        // This is where all merging happens - streaming just appends raw deltas
        const mergedParts: typeof message.parts = [];
        for (const part of message.parts) {
          const lastMerged = mergedParts[mergedParts.length - 1];

          // Try to merge with last part if same type
          if (lastMerged?.type === "text" && part.type === "text") {
            // Merge text parts
            mergedParts[mergedParts.length - 1] = {
              type: "text",
              text: lastMerged.text + part.text,
            };
          } else if (lastMerged?.type === "reasoning" && part.type === "reasoning") {
            // Merge reasoning parts
            mergedParts[mergedParts.length - 1] = {
              type: "reasoning",
              text: lastMerged.text + part.text,
            };
          } else {
            // Different type or tool part - add new part
            mergedParts.push(part);
          }
        }

        // Find the last part that will produce a DisplayedMessage
        // (reasoning, text parts with content, OR tool parts)
        let lastPartIndex = -1;
        for (let i = mergedParts.length - 1; i >= 0; i--) {
          const part = mergedParts[i];
          if (
            part.type === "reasoning" ||
            (part.type === "text" && part.text) ||
            isDynamicToolPart(part)
          ) {
            lastPartIndex = i;
            break;
          }
        }

        mergedParts.forEach((part, partIndex) => {
          const isLastPart = partIndex === lastPartIndex;
          // Part is streaming if: active stream exists AND this is the last part
          const isStreaming = hasActiveStream && isLastPart;

          if (part.type === "reasoning") {
            // Reasoning part - shows thinking/reasoning content
            displayedMessages.push({
              type: "reasoning",
              id: `${message.id}-${partIndex}`,
              historyId: message.id,
              content: part.text,
              historySequence,
              streamSequence: streamSeq++,
              isStreaming,
              isPartial: message.metadata?.partial ?? false,
              isLastPartOfMessage: isLastPart,
              timestamp: baseTimestamp,
            });
          } else if (part.type === "text" && part.text) {
            // Skip empty text parts
            displayedMessages.push({
              type: "assistant",
              id: `${message.id}-${partIndex}`,
              historyId: message.id,
              content: part.text,
              historySequence,
              streamSequence: streamSeq++,
              isStreaming,
              isPartial: message.metadata?.partial ?? false,
              isLastPartOfMessage: isLastPart,
              model: message.metadata?.model,
              timestamp: baseTimestamp,
            });
          } else if (isDynamicToolPart(part)) {
            const status =
              part.state === "output-available"
                ? "completed"
                : part.state === "input-available" && message.metadata?.partial
                  ? "interrupted"
                  : part.state === "input-available"
                    ? "executing"
                    : "pending";

            displayedMessages.push({
              type: "tool",
              id: `${message.id}-${partIndex}`,
              historyId: message.id,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.input,
              result: part.state === "output-available" ? part.output : undefined,
              status,
              isPartial: message.metadata?.partial ?? false,
              historySequence,
              streamSequence: streamSeq++,
              isLastPartOfMessage: isLastPart,
              timestamp: baseTimestamp,
            });
          }
        });

        // Create stream-error DisplayedMessage if message has error metadata
        // This happens after all parts are displayed, so error appears at the end
        if (message.metadata?.error) {
          displayedMessages.push({
            type: "stream-error",
            id: `${message.id}-error`,
            historyId: message.id,
            error: message.metadata.error,
            errorType: message.metadata.errorType ?? "unknown",
            historySequence,
            model: message.metadata.model,
            timestamp: baseTimestamp,
          });
        }
      }
    }

    return displayedMessages;
  }
}
