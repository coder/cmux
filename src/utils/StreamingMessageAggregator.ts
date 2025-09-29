import { CmuxMessage, createCmuxMessage } from "../types/message";

interface StreamingContext {
  streamingId: string;
  messageId: string;
  contentParts: string[];
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
      contentParts: [],
      startTime: Date.now(),
      isComplete: false,
    };

    this.activeStreams.set(context.streamingId, context);

    // Create initial streaming message
    const streamingMessage = createCmuxMessage(messageId, "assistant", "", {
      sequenceNumber: this.sequenceCounter++,
      streamingId: context.streamingId,
      timestamp: Date.now(),
    });
    // Mark as streaming
    streamingMessage.parts[0] = { type: "text", text: "", state: "streaming" };

    this.messages.set(messageId, streamingMessage);
    return context;
  }

  updateStreaming(streamingId: string, delta: string): void {
    const context = this.activeStreams.get(streamingId);
    if (!context) return;

    context.contentParts.push(delta);

    // Update the message content
    const message = this.messages.get(context.messageId);
    if (message && message.parts[0]?.type === "text") {
      const newContent = context.contentParts.join("");
      message.parts[0] = { type: "text", text: newContent, state: "streaming" };
    }
  }

  finishStreaming(streamingId: string, finalContent?: string): void {
    const context = this.activeStreams.get(streamingId);
    if (!context) return;

    context.isComplete = true;

    // Mark message as no longer streaming
    const message = this.messages.get(context.messageId);
    if (message && message.parts[0]?.type === "text") {
      // Use finalContent if provided, otherwise use accumulated content
      const content = finalContent !== undefined ? finalContent : context.contentParts.join("");
      message.parts[0] = { type: "text", text: content, state: "done" };

      // Update duration if we have start time
      if (message.metadata) {
        message.metadata.duration = Date.now() - context.startTime;
      }
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
}
