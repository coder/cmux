import { UIMessage, StreamingContext, HistoryMessage } from "../types/claude";
import type { SDKPartialAssistantMessage } from "@anthropic-ai/claude-code";

/**
 * StreamingMessageAggregator - Pure Data Layer
 *
 * PURPOSE:
 * This class is responsible ONLY for aggregating raw SDK messages into a
 * structured format. It manages streaming state and message ordering.
 *
 * RULES - DO NOT VIOLATE:
 * 1. NO FORMATTING: Do not add emojis, format text, or create display strings
 * 2. NO PRESENTATION LOGIC: Do not make decisions about how messages should look
 * 3. RAW DATA ONLY: Store messages as close to their original format as possible
 * 4. STRUCTURE ONLY: Only transform data structure (e.g., streaming to final messages)
 *
 * All formatting, styling, and presentation decisions belong in the component layer:
 * - MessageRenderer decides which component to use
 * - Individual message components handle their own formatting
 * - Components own all display logic
 */
export class StreamingMessageAggregator {
  private uiMessages: Map<string, UIMessage> = new Map();
  private activeStreams: Map<string, StreamingContext> = new Map();
  private toolUseMap: Map<string, UIMessage> = new Map(); // Track pending tool uses by ID
  private availableCommands: string[] = [];
  private currentModel: string | undefined; // Track the latest model from assistant messages
  // Any unhandled message types will be silently lost.
  processSDKMessage(historyMessage: HistoryMessage): void {
    switch (historyMessage.type) {
      case "user":
        this.addUserMessage(historyMessage);
        break;

      case "system":
        this.addSystemMessage(historyMessage);
        break;

      case "stream_event":
        this.handleStreamEvent(historyMessage);
        break;

      case "assistant":
        this.handleAssistantMessage(historyMessage);
        break;

      case "result":
        this.addResultBreadcrumb(historyMessage);
        break;

      case "tool_result" as any:
        this.handleToolResult(historyMessage);
        break;
    }
  }

  getAllMessages(): UIMessage[] {
    return Array.from(this.uiMessages.values()).sort((a, b) => {
      // Handle missing cmuxMeta gracefully
      const aSeq = a.metadata?.cmuxMeta?.sequenceNumber ?? 0;
      const bSeq = b.metadata?.cmuxMeta?.sequenceNumber ?? 0;
      return aSeq - bSeq;
    });
  }

  private addUserMessage(historyMessage: HistoryMessage): void {
    // Check if this is a tool_result wrapped in a user message
    const message = historyMessage as any; // SDKMessage union
    const content = message.message?.content;
    if (Array.isArray(content) && content.length > 0) {
      const firstBlock = content[0];
      if (firstBlock.type === "tool_result") {
        // This is a tool result, process it accordingly
        this.handleToolResultFromUser(historyMessage, firstBlock);
        return;
      }
    }

    // Regular user message
    const userMessage: UIMessage = {
      id: historyMessage.uuid || `user-${Date.now()}`,
      type: "user",
      content: message.message?.content || "",
      timestamp: Date.now(), // User messages don't have timestamp in SDK
      metadata: {
        originalSDKMessage: historyMessage as any, // Store without cmuxMeta
        cmuxMeta: historyMessage.cmuxMeta,
      },
    };
    this.uiMessages.set(userMessage.id, userMessage);
  }

  private handleToolResultFromUser(historyMessage: HistoryMessage, toolResultBlock: any): void {
    // Extract tool result data from the user message
    const toolUseId = toolResultBlock.tool_use_id;
    const content = toolResultBlock.content;
    const isError = toolResultBlock.is_error || false;

    // Look up the corresponding tool_use message
    const toolUseMessage = toolUseId ? this.toolUseMap.get(toolUseId) : null;

    // Create tool_result message with association
    const resultMessage: UIMessage = {
      id: historyMessage.uuid || `tool-result-${Date.now()}`,
      type: "tool_result" as any,
      content: content,
      toolUseId: toolUseId,
      toolResult: {
        content: content,
        is_error: isError,
      },
      timestamp: Date.now(), // Tool results don't have timestamp
      metadata: {
        originalSDKMessage: historyMessage as any, // Store without cmuxMeta
        cmuxMeta: historyMessage.cmuxMeta,
      },
    };

    // Add associated tool use data if found
    if (toolUseMessage) {
      resultMessage.associatedToolUse = {
        name: toolUseMessage.metadata?.toolName || "unknown",
        input: toolUseMessage.metadata?.toolInput,
      };
    }

    this.uiMessages.set(resultMessage.id, resultMessage);
  }

  private addSystemMessage(historyMessage: HistoryMessage): void {
    // Type-safe extraction based on message structure
    const message = historyMessage as any; // SDKMessage union - we'll extract specific fields

    // Extract system-specific fields based on subtype
    const metadata: any = {
      originalSDKMessage: historyMessage, // Store properly typed
      cmuxMeta: historyMessage.cmuxMeta,
      systemSubtype: message.subtype,
    };

    if (message.subtype === "init") {
      // Extract init-specific fields
      metadata.systemModel = message.model;
      metadata.systemTools = message.tools;
      metadata.systemSlashCommands = message.slash_commands;

      // Store commands for autocomplete
      if (message.slash_commands) {
        this.availableCommands = message.slash_commands;
      }
    } else if (message.subtype === "compact_boundary") {
      // Extract compact-specific fields
      metadata.compactMetadata = message.compact_metadata;
    }

    // Store raw system message without formatting
    const systemMessage: UIMessage = {
      id: historyMessage.uuid || `system-${Date.now()}`,
      type: "system",
      content: message.content || historyMessage, // Store raw content or entire message
      timestamp: Date.now(),
      metadata,
    };
    this.uiMessages.set(systemMessage.id, systemMessage);
  }

  private addResultBreadcrumb(historyMessage: HistoryMessage): void {
    // Type-safe extraction of result message fields
    const message = historyMessage as any; // SDKMessage union

    // Store raw result message without formatting
    const resultMessage: UIMessage = {
      id: historyMessage.uuid || `result-${Date.now()}`,
      type: "result",
      content: message.result || historyMessage, // Raw result or entire message
      model: this.currentModel, // Include current model for result messages
      timestamp: Date.now(),
      metadata: {
        originalSDKMessage: historyMessage, // Store properly typed
        cmuxMeta: historyMessage.cmuxMeta,
        cost: message.total_cost_usd,
        duration: message.duration_ms,
        resultIsError: message.is_error,
        resultSubtype: message.subtype,
        resultText: message.result,
      },
    };
    this.uiMessages.set(resultMessage.id, resultMessage);
  }

  private handleStreamEvent(historyMessage: HistoryMessage): void {
    // Type narrow using discriminated union
    if (historyMessage.type !== "stream_event") return;

    // Cast to SDKPartialAssistantMessage which we know it is after type check
    const streamMessage = historyMessage as SDKPartialAssistantMessage & {
      cmuxMeta: typeof historyMessage.cmuxMeta;
    };
    const event = streamMessage.event;
    if (!event) return;

    // The event is a union type, so we check for type property existence
    const eventType = "type" in event ? event.type : null;

    // Pass through all stream events as debug messages
    const streamEventMessage: UIMessage = {
      id: `stream-event-${Date.now()}-${Math.random()}`,
      type: "stream_event" as UIMessage["type"] & "stream_event",
      content: historyMessage,
      timestamp: Date.now(),
      metadata: {
        originalSDKMessage: historyMessage, // Store the full message
        cmuxMeta: historyMessage.cmuxMeta,
        eventType: eventType || "unknown",
      },
    };
    this.uiMessages.set(streamEventMessage.id, streamEventMessage);

    // Also handle specific events for streaming functionality
    switch (eventType) {
      case "message_start":
        this.startStreamingMessage(historyMessage);
        break;
      case "content_block_start":
        // Initialize content block - handled by message_start for now
        break;
      case "content_block_delta":
        this.updateStreamingMessage(historyMessage);
        break;
      case "content_block_stop":
        // Content block finished - no action needed as we track by message
        break;
      case "message_delta":
        // Message metadata update - could be used for stop_reason, usage, etc.
        break;
      case "message_stop":
        this.finishStreamingMessage(historyMessage);
        break;
      default:
        // Log unknown event types for debugging
        if (eventType) {
          console.debug(`Unknown stream event type: ${eventType}`);
        }
        break;
    }
  }

  private startStreamingMessage(historyMessage: HistoryMessage): void {
    if (historyMessage.type !== "stream_event") return;

    const streamMessage = historyMessage as SDKPartialAssistantMessage & {
      cmuxMeta: typeof historyMessage.cmuxMeta;
    };
    const event = streamMessage.event;

    // Check if this is a message_start event which has the message property
    let streamingId = `stream-${Date.now()}`;
    if (event && "message" in event && event.message) {
      streamingId = event.message.id || streamingId;
      // Extract model from message_start event
      if ("model" in event.message) {
        this.currentModel = event.message.model;
      }
    }
    const messageId = `streaming-${streamingId}`;

    const context: StreamingContext = {
      streamingId,
      messageId,
      contentParts: [],
      startTime: Date.now(),
      isComplete: false,
    };

    this.activeStreams.set(streamingId, context);

    const streamingMessage: UIMessage = {
      id: messageId,
      type: "assistant",
      content: "",
      contentDeltas: [],
      isStreaming: true,
      model: this.currentModel,
      timestamp: Date.now(),
      metadata: {
        streamingId,
        originalSDKMessage: historyMessage,
        cmuxMeta: historyMessage.cmuxMeta,
      },
    };

    this.uiMessages.set(messageId, streamingMessage);
  }

  private updateStreamingMessage(historyMessage: HistoryMessage): void {
    const streamingId = this.findStreamingIdFromEvent();
    if (!streamingId) return;

    const context = this.activeStreams.get(streamingId);
    if (!context) return;

    if (historyMessage.type !== "stream_event") return;

    const streamMessage = historyMessage as SDKPartialAssistantMessage & {
      cmuxMeta: typeof historyMessage.cmuxMeta;
    };
    const event = streamMessage.event;

    // Check if event has delta property and it's a text_delta
    if (!event || !("delta" in event) || !event.delta) return;

    // Check the delta type - it could be different types in the union
    const delta = event.delta;
    if (!("type" in delta) || delta.type !== "text_delta") return;

    const deltaText = ("text" in delta ? delta.text : "") || "";
    context.contentParts.push(deltaText);

    // Update existing message in Map with raw deltas
    const existingMessage = this.uiMessages.get(context.messageId);
    if (existingMessage) {
      this.uiMessages.set(context.messageId, {
        ...existingMessage,
        content: context.contentParts.join(""),
        contentDeltas: [...(existingMessage.contentDeltas || []), deltaText],
        isStreaming: true,
      });
    }
  }

  private finishStreamingMessage(_historyMessage: any): void {
    const streamingId = this.findStreamingIdFromEvent();
    if (!streamingId) return;

    const context = this.activeStreams.get(streamingId);
    if (!context) return;

    // Mark streaming as complete
    context.isComplete = true;

    // Update existing streaming message to mark as complete
    const existingMessage = this.uiMessages.get(context.messageId);
    if (existingMessage) {
      this.uiMessages.set(context.messageId, {
        ...existingMessage,
        isStreaming: false,
      });
    }
  }

  private handleAssistantMessage(historyMessage: HistoryMessage): void {
    // Check if this is a tool_use message
    if (this.isToolUseMessage(historyMessage)) {
      this.addToolUseBreadcrumb(historyMessage);
      return;
    }

    // Find active streaming context to replace
    const activeStreams = Array.from(this.activeStreams.values());

    if (activeStreams.length > 0) {
      // Use the UUID from the assistant message, replacing streaming message
      const context = activeStreams[activeStreams.length - 1];
      const assistantId = historyMessage.uuid || context.messageId;

      // Delete old streaming message if it has a different ID
      if (context.messageId !== assistantId) {
        this.uiMessages.delete(context.messageId);
      }

      const finalMessage: UIMessage = {
        id: assistantId,
        type: "assistant",
        content: this.extractAssistantContent(historyMessage),
        isStreaming: false,
        model: this.currentModel,
        timestamp: (historyMessage as any).timestamp || Date.now(),
        metadata: {
          originalSDKMessage: historyMessage,
          cmuxMeta: historyMessage.cmuxMeta,
        },
      };

      this.uiMessages.set(assistantId, finalMessage);
      this.activeStreams.delete(context.streamingId);
    } else {
      // Standalone assistant message (not from streaming)
      const assistantMessage: UIMessage = {
        id: historyMessage.uuid || `assistant-${Date.now()}`,
        type: "assistant",
        content: this.extractAssistantContent(historyMessage),
        model: this.currentModel,
        timestamp: (historyMessage as any).timestamp || Date.now(),
        metadata: {
          originalSDKMessage: historyMessage,
          cmuxMeta: historyMessage.cmuxMeta,
        },
      };

      this.uiMessages.set(assistantMessage.id, assistantMessage);
    }
  }

  private isToolUseMessage(historyMessage: HistoryMessage): boolean {
    const message = historyMessage as any; // SDKAssistantMessage
    if (!message.message?.content || !Array.isArray(message.message.content)) {
      return false;
    }

    // Check if all content blocks are tool_use
    return message.message.content.every((block: any) => block.type === "tool_use");
  }

  private addToolUseBreadcrumb(historyMessage: HistoryMessage): void {
    const message = historyMessage as any; // SDKAssistantMessage
    const content = message.message?.content;
    if (!content || !Array.isArray(content)) return;

    // Process each tool_use block
    content.forEach((block: any) => {
      if (block.type !== "tool_use") return;

      // Create a clean tool_use message without formatting
      const toolMessage: UIMessage = {
        id: block.id || `tool-${Date.now()}-${Math.random()}`,
        type: "tool_use" as any, // Will be handled by MessageRenderer
        content: block, // Store the raw tool block
        toolUseId: block.id, // Store the tool use ID for result association
        timestamp: Date.now(),
        metadata: {
          originalSDKMessage: historyMessage,
          cmuxMeta: historyMessage.cmuxMeta,
          toolName: block.name,
          toolInput: block.input,
        },
      };

      // Store in both maps for lookup
      this.uiMessages.set(toolMessage.id, toolMessage);
      if (block.id) {
        this.toolUseMap.set(block.id, toolMessage);
      }
    });
  }

  private extractAssistantContent(historyMessage: HistoryMessage): string {
    const message = historyMessage as any; // SDKAssistantMessage
    if (message.message?.content) {
      const content = message.message.content;

      // Handle array of content blocks
      if (Array.isArray(content)) {
        return content
          .map((block: any) => {
            if (typeof block === "string") {
              return block;
            } else if (block.text) {
              return block.text;
            } else if (block.type) {
              // For non-text content blocks, show as JSON
              return typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content || block, null, 2);
            }
            return "";
          })
          .join("");
      }

      // Handle string content
      if (typeof content === "string") {
        return content;
      }

      // Fallback for other types
      return JSON.stringify(content, null, 2);
    }
    return "(No content)";
  }

  private findStreamingIdFromEvent(): string | null {
    const recentStreams = Array.from(this.activeStreams.keys());
    return recentStreams.length > 0 ? recentStreams[recentStreams.length - 1] : null;
  }

  private handleToolResult(historyMessage: HistoryMessage): void {
    // Extract tool result data
    const message = historyMessage as any; // Tool result message
    const toolUseId = message.tool_use_id;
    const content = message.content;
    const isError = message.is_error || false;

    // Look up the corresponding tool_use message
    const toolUseMessage = toolUseId ? this.toolUseMap.get(toolUseId) : null;

    // Create tool_result message with association
    const resultMessage: UIMessage = {
      id: historyMessage.uuid || `tool-result-${Date.now()}`,
      type: "tool_result" as any,
      content: content,
      toolUseId: toolUseId,
      toolResult: {
        content: content,
        is_error: isError,
      },
      timestamp: Date.now(),
      metadata: {
        originalSDKMessage: historyMessage as any, // Store without cmuxMeta
        cmuxMeta: historyMessage.cmuxMeta,
      },
    };

    // Add associated tool use data if found
    if (toolUseMessage) {
      resultMessage.associatedToolUse = {
        name: toolUseMessage.metadata?.toolName || "unknown",
        input: toolUseMessage.metadata?.toolInput,
      };
    }

    this.uiMessages.set(resultMessage.id, resultMessage);
  }

  clear() {
    this.uiMessages.clear();
    this.activeStreams.clear();
    this.toolUseMap.clear();
    // Reset sequence counter if it exists
    // this.sequenceCounter = 0;
    this.availableCommands = [];
  }

  getAvailableCommands(): string[] {
    return this.availableCommands;
  }
}
