import { CmuxMessage, CmuxMetadata, createCmuxMessage, DisplayedMessage } from "../types/message";
import type {
  StreamStartEvent,
  StreamDeltaEvent,
  StreamEndEvent,
  ToolCallStartEvent,
  ToolCallDeltaEvent,
  ToolCallEndEvent,
} from "../types/aiEvents";
import type { WorkspaceChatMessage } from "../types/ipc";
import type {
  DynamicToolPart,
  DynamicToolPartPending,
  DynamicToolPartAvailable,
} from "../types/toolParts";
import { isDynamicToolPart } from "../types/toolParts";

interface StreamingContext {
  streamingId: string;
  messageId: string;
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
  private messages: Map<string, CmuxMessage> = new Map();
  private activeStreams: Map<string, StreamingContext> = new Map();
  private sequenceCounter: number = 0;

  addMessage(message: CmuxMessage): void {
    // Assign sequence number for ordering
    message.metadata = {
      ...message.metadata,
      sequenceNumber: this.sequenceCounter++,
    };
    this.messages.set(message.id, message);
  }

  startStreaming(messageId: string): StreamingContext {
    const context: StreamingContext = {
      streamingId: `stream-${Date.now()}-${Math.random()}`,
      messageId,
      startTime: Date.now(),
      isComplete: false,
    };

    this.activeStreams.set(context.streamingId, context);

    // Create initial streaming message with empty streaming text part
    const streamingMessage = createCmuxMessage(messageId, "assistant", "", {
      sequenceNumber: this.sequenceCounter++,
      streamingId: context.streamingId,
      timestamp: Date.now(),
    });
    // Start with a single streaming text part
    streamingMessage.parts[0] = { type: "text", text: "", state: "streaming" };

    this.messages.set(messageId, streamingMessage);
    return context;
  }

  updateStreaming(streamingId: string, delta: string): void {
    const context = this.activeStreams.get(streamingId);
    if (!context) return;

    const message = this.messages.get(context.messageId);
    if (!message) return;

    // Find the last text part that's still streaming
    let streamingPartIndex = -1;
    for (let i = message.parts.length - 1; i >= 0; i--) {
      const part = message.parts[i];
      if (part.type === "text" && part.state === "streaming") {
        streamingPartIndex = i;
        break;
      }
    }

    // If no streaming part found, create one
    if (streamingPartIndex === -1) {
      message.parts.push({ type: "text", text: delta, state: "streaming" });
    } else {
      // Append delta to the streaming text part
      const part = message.parts[streamingPartIndex];
      if (part.type === "text") {
        message.parts[streamingPartIndex] = {
          type: "text",
          text: part.text + delta,
          state: "streaming",
        };
      }
    }
  }

  finishStreaming(
    streamingId: string,
    finalContent?: string,
    additionalMetadata?: Partial<CmuxMetadata>
  ): void {
    const context = this.activeStreams.get(streamingId);
    if (!context) return;

    context.isComplete = true;

    const message = this.messages.get(context.messageId);
    if (!message) {
      this.activeStreams.delete(streamingId);
      return;
    }

    // Simply mark all streaming parts as done
    for (let i = 0; i < message.parts.length; i++) {
      const part = message.parts[i];
      if (part.type === "text" && part.state === "streaming") {
        message.parts[i] = { ...part, state: "done" };
      }
    }

    // Update metadata with duration and any additional metadata
    if (message.metadata) {
      message.metadata = {
        ...message.metadata,
        duration: Date.now() - context.startTime,
        ...additionalMetadata,
      };
    }

    // Clean up active stream
    this.activeStreams.delete(streamingId);
  }

  getAllMessages(): CmuxMessage[] {
    return Array.from(this.messages.values()).sort(
      (a, b) => (a.metadata?.sequenceNumber ?? 0) - (b.metadata?.sequenceNumber ?? 0)
    );
  }

  getActiveStreams(): StreamingContext[] {
    return Array.from(this.activeStreams.values());
  }

  clear(): void {
    this.messages.clear();
    this.activeStreams.clear();
    this.sequenceCounter = 0;
  }

  // Unified event handlers that encapsulate all complex logic
  handleStreamStart(data: StreamStartEvent): void {
    const context: StreamingContext = {
      streamingId: `stream-${Date.now()}-${Math.random()}`,
      messageId: data.messageId,
      startTime: Date.now(),
      isComplete: false,
    };

    this.activeStreams.set(context.streamingId, context);

    // Create initial streaming message
    const streamingMessage = createCmuxMessage(data.messageId, "assistant", "", {
      sequenceNumber: this.sequenceCounter++,
      streamingId: context.streamingId,
      timestamp: Date.now(),
      model: data.model,
    });
    // Mark as streaming
    streamingMessage.parts[0] = { type: "text", text: "", state: "streaming" };

    this.messages.set(data.messageId, streamingMessage);
  }

  handleStreamDelta(data: StreamDeltaEvent): void {
    // Find the active stream for this messageId
    const activeStream = this.getActiveStreams().find((s) => s.messageId === data.messageId);
    if (activeStream) {
      this.updateStreaming(activeStream.streamingId, data.delta);
    }
  }

  handleStreamEnd(data: StreamEndEvent): void {
    // Find active stream if exists
    const activeStream = this.getActiveStreams().find((s) => s.messageId === data.messageId);

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

        // Mark streaming parts as done
        for (let i = 0; i < message.parts.length; i++) {
          const part = message.parts[i];
          if (part.type === "text" && part.state === "streaming") {
            message.parts[i] = { ...part, state: "done" };
          }
        }

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

      // Clean up active stream
      this.activeStreams.delete(activeStream.streamingId);
    } else {
      // Reconnection case: user reconnected after stream completed
      // We reconstruct the entire message from the stream-end event
      // The backend now sends us the parts array with proper temporal ordering

      // Create the complete message
      const message: CmuxMessage = {
        id: data.messageId,
        role: "assistant",
        metadata: {
          sequenceNumber: this.sequenceCounter++,
          ...data.metadata,
          timestamp: Date.now(),
        },
        parts: data.parts,
      };

      this.messages.set(data.messageId, message);
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

    // Mark current streaming text as done
    for (let i = 0; i < message.parts.length; i++) {
      const part = message.parts[i];
      if (part.type === "text" && part.state === "streaming") {
        message.parts[i] = { ...part, state: "done" };
      }
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

    // Add new streaming text part for content after the tool
    message.parts.push({ type: "text", text: "", state: "streaming" });
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
          part.type === "dynamic-tool" && (part as DynamicToolPart).toolCallId === data.toolCallId
      ) as DynamicToolPart | undefined;
      if (toolPart) {
        // Type assertion needed because TypeScript can't narrow the discriminated union
        (toolPart as DynamicToolPartAvailable).state = "output-available";
        (toolPart as DynamicToolPartAvailable).output = data.result;
      }
    }
  }

  handleMessage(data: WorkspaceChatMessage): void {
    // Handle regular messages (user messages, historical messages)
    // Check if it's a CmuxMessage (has role property but no type)
    if ("role" in data && !("type" in data)) {
      this.addMessage(data as CmuxMessage);
    }
  }

  /**
   * Transform CmuxMessages into DisplayedMessages for UI consumption
   * This splits complex messages with multiple parts into separate UI blocks
   * while preserving temporal ordering through sequence numbers
   */
  getDisplayedMessages(): DisplayedMessage[] {
    const displayedMessages: DisplayedMessage[] = [];
    let displaySequenceCounter = 0;

    for (const message of this.getAllMessages()) {
      const baseTimestamp = message.metadata?.timestamp;

      if (message.role === "user") {
        // User messages: combine all text parts into single block
        const content = message.parts
          .filter((p) => p.type === "text")
          .map((p) => p.text)
          .join("");

        displayedMessages.push({
          type: "user",
          id: `${message.id}-user`,
          content,
          sequenceNumber: displaySequenceCounter++,
          timestamp: baseTimestamp,
        });
      } else if (message.role === "assistant") {
        // Assistant messages: each part becomes a separate DisplayedMessage
        message.parts.forEach((part, partIndex) => {
          if (part.type === "text" && part.text) {
            // Skip empty text parts
            displayedMessages.push({
              type: "assistant",
              id: `${message.id}-${partIndex}`,
              content: part.text,
              sequenceNumber: displaySequenceCounter++,
              isStreaming: part.state === "streaming",
              model: message.metadata?.model,
              timestamp: baseTimestamp,
              tokens: message.metadata?.tokens,
            });
          } else if (isDynamicToolPart(part)) {
            const status =
              part.state === "output-available"
                ? "completed"
                : part.state === "input-available"
                  ? "executing"
                  : "pending";

            displayedMessages.push({
              type: "tool",
              id: `${message.id}-${partIndex}`,
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.input,
              result: part.state === "output-available" ? part.output : undefined,
              status,
              sequenceNumber: displaySequenceCounter++,
              timestamp: baseTimestamp,
            });
          }
        });
      }
    }

    return displayedMessages;
  }
}
