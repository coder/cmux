import { UIMessage, StreamingContext } from "../types/claude";

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
  private toolUseMap: Map<string, UIMessage> = new Map();  // Track pending tool uses by ID
  private sequenceCounter: number = 0;
  private availableCommands: string[] = [];
  // Any unhandled message types will be silently lost.
  processSDKMessage(sdkMessage: any): void {
    switch (sdkMessage.type) {
      case "user":
        this.addUserMessage(sdkMessage);
        break;

      case "system":
        this.addSystemMessage(sdkMessage);
        break;

      case "stream_event":
        this.handleStreamEvent(sdkMessage);
        break;

      case "assistant":
        this.handleAssistantMessage(sdkMessage);
        break;

      case "result":
        this.addResultBreadcrumb(sdkMessage);
        break;
        
      case "tool_result":
        this.handleToolResult(sdkMessage);
        break;
    }
  }

  getAllMessages(): UIMessage[] {
    return Array.from(this.uiMessages.values()).sort((a, b) => {
      return a.sequenceNumber - b.sequenceNumber;
    });
  }

  private addUserMessage(sdkMessage: any): void {
    // Check if this is a tool_result wrapped in a user message
    const content = sdkMessage.message?.content;
    if (Array.isArray(content) && content.length > 0) {
      const firstBlock = content[0];
      if (firstBlock.type === 'tool_result') {
        // This is a tool result, process it accordingly
        this.handleToolResultFromUser(sdkMessage, firstBlock);
        return;
      }
    }
    
    // Regular user message
    const userMessage: UIMessage = {
      id: sdkMessage.uuid || `user-${Date.now()}`,
      type: "user",
      content: sdkMessage.message?.content || "",
      sequenceNumber: sdkMessage.metadata?.cmuxMeta?.sequenceNumber ?? 
                      sdkMessage._sequenceNumber ?? 
                      this.sequenceCounter++,
      timestamp: sdkMessage.timestamp || Date.now(),
      metadata: { originalSDKMessage: sdkMessage },
    };
    this.uiMessages.set(userMessage.id, userMessage);
  }
  
  private handleToolResultFromUser(sdkMessage: any, toolResultBlock: any): void {
    // Extract tool result data from the user message
    const toolUseId = toolResultBlock.tool_use_id;
    const content = toolResultBlock.content;
    const isError = toolResultBlock.is_error || false;
    
    // Look up the corresponding tool_use message
    const toolUseMessage = toolUseId ? this.toolUseMap.get(toolUseId) : null;
    
    // Create tool_result message with association
    const resultMessage: UIMessage = {
      id: sdkMessage.uuid || `tool-result-${Date.now()}`,
      type: "tool_result" as any,
      content: content,
      toolUseId: toolUseId,
      toolResult: {
        content: content,
        is_error: isError
      },
      sequenceNumber: sdkMessage.metadata?.cmuxMeta?.sequenceNumber ?? 
                      sdkMessage._sequenceNumber ?? 
                      this.sequenceCounter++,
      timestamp: sdkMessage.timestamp || Date.now(),
      metadata: {
        originalSDKMessage: sdkMessage
      }
    };
    
    // Add associated tool use data if found
    if (toolUseMessage) {
      resultMessage.associatedToolUse = {
        name: toolUseMessage.metadata?.toolName || 'unknown',
        input: toolUseMessage.metadata?.toolInput
      };
    }
    
    this.uiMessages.set(resultMessage.id, resultMessage);
  }

  private addSystemMessage(sdkMessage: any): void {
    // Extract available commands from system/init messages
    if (sdkMessage.subtype === 'init' && sdkMessage.slash_commands) {
      this.availableCommands = sdkMessage.slash_commands;
    }
    
    // Store raw system message without formatting
    const systemMessage: UIMessage = {
      id: sdkMessage.uuid || `system-${Date.now()}`,
      type: "system",
      content: sdkMessage.content || sdkMessage, // Store raw content or entire message
      sequenceNumber: sdkMessage.metadata?.cmuxMeta?.sequenceNumber ?? 
                      sdkMessage._sequenceNumber ?? 
                      this.sequenceCounter++,
      timestamp: Date.now(),
      metadata: { originalSDKMessage: sdkMessage },
    };
    this.uiMessages.set(systemMessage.id, systemMessage);
  }

  private addResultBreadcrumb(sdkMessage: any): void {
    // Store raw result message without formatting
    const resultMessage: UIMessage = {
      id: sdkMessage.uuid || `result-${Date.now()}`,
      type: "result",
      content: sdkMessage.result || sdkMessage, // Raw result or entire message
      sequenceNumber: sdkMessage.metadata?.cmuxMeta?.sequenceNumber ?? 
                      sdkMessage._sequenceNumber ?? 
                      this.sequenceCounter++,
      timestamp: Date.now(),
      metadata: { 
        originalSDKMessage: sdkMessage,
        cost: sdkMessage.total_cost_usd,
        duration: sdkMessage.duration_ms
      },
    };
    this.uiMessages.set(resultMessage.id, resultMessage);
  }

  private handleStreamEvent(sdkMessage: any): void {
    const event = sdkMessage.event;
    if (!event) return;

    // Pass through all stream events as debug messages
    const streamEventMessage: UIMessage = {
      id: `stream-event-${Date.now()}-${Math.random()}`,
      type: "stream_event" as any,
      content: sdkMessage,
      sequenceNumber: sdkMessage.metadata?.cmuxMeta?.sequenceNumber ?? 
                      sdkMessage._sequenceNumber ?? 
                      this.sequenceCounter++,
      timestamp: Date.now(),
      metadata: { 
        originalSDKMessage: sdkMessage,
        eventType: event.type
      },
    };
    this.uiMessages.set(streamEventMessage.id, streamEventMessage);

    // Also handle specific events for streaming functionality
    switch (event.type) {
      case "message_start":
        this.startStreamingMessage(sdkMessage);
        break;
      case "content_block_start":
        // Initialize content block - handled by message_start for now
        break;
      case "content_block_delta":
        this.updateStreamingMessage(sdkMessage);
        break;
      case "content_block_stop":
        // Content block finished - no action needed as we track by message
        break;
      case "message_delta":
        // Message metadata update - could be used for stop_reason, usage, etc.
        break;
      case "message_stop":
        this.finishStreamingMessage(sdkMessage);
        break;
      default:
        // Log unknown event types for debugging
        console.debug(`Unknown stream event type: ${event.type}`);
        break;
    }
  }

  private startStreamingMessage(sdkMessage: any): void {
    const streamingId = sdkMessage.event.message?.id || `stream-${Date.now()}`;
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
      sequenceNumber: sdkMessage.metadata?.cmuxMeta?.sequenceNumber ?? 
                      sdkMessage._sequenceNumber ?? 
                      this.sequenceCounter++,
      timestamp: Date.now(),
      metadata: { streamingId, originalSDKMessage: sdkMessage },
    };
    
    this.uiMessages.set(messageId, streamingMessage);
  }

  private updateStreamingMessage(sdkMessage: any): void {
    const streamingId = this.findStreamingIdFromEvent();
    if (!streamingId) return;

    const context = this.activeStreams.get(streamingId);
    if (!context) return;

    const deltaText = sdkMessage.event.delta?.text || "";
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

  private finishStreamingMessage(_sdkMessage: any): void {
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

  private handleAssistantMessage(sdkMessage: any): void {
    // Check if this is a tool_use message
    if (this.isToolUseMessage(sdkMessage)) {
      this.addToolUseBreadcrumb(sdkMessage);
      return;
    }

    // Find active streaming context to replace
    const activeStreams = Array.from(this.activeStreams.values());
    
    if (activeStreams.length > 0) {
      // Use the UUID from the assistant message, replacing streaming message
      const context = activeStreams[activeStreams.length - 1];
      const assistantId = sdkMessage.uuid || context.messageId;
      
      // Delete old streaming message if it has a different ID
      if (context.messageId !== assistantId) {
        this.uiMessages.delete(context.messageId);
      }
      
      const finalMessage: UIMessage = {
        id: assistantId,
        type: "assistant",
        content: this.extractAssistantContent(sdkMessage),
        isStreaming: false,
        sequenceNumber: sdkMessage.metadata?.cmuxMeta?.sequenceNumber ?? 
                      sdkMessage._sequenceNumber ?? 
                      this.sequenceCounter++,
        timestamp: sdkMessage.timestamp || Date.now(),
        metadata: { 
          originalSDKMessage: sdkMessage,
        },
      };
      
      this.uiMessages.set(assistantId, finalMessage);
      this.activeStreams.delete(context.streamingId);
    } else {
      // Standalone assistant message (not from streaming)
      const assistantMessage: UIMessage = {
        id: sdkMessage.uuid || `assistant-${Date.now()}`,
        type: "assistant",
        content: this.extractAssistantContent(sdkMessage),
        sequenceNumber: sdkMessage.metadata?.cmuxMeta?.sequenceNumber ?? 
                      sdkMessage._sequenceNumber ?? 
                      this.sequenceCounter++,
        timestamp: sdkMessage.timestamp || Date.now(),
        metadata: { originalSDKMessage: sdkMessage },
      };
      
      this.uiMessages.set(assistantMessage.id, assistantMessage);
    }
  }

  private isToolUseMessage(sdkMessage: any): boolean {
    if (!sdkMessage.message?.content || !Array.isArray(sdkMessage.message.content)) {
      return false;
    }
    
    // Check if all content blocks are tool_use
    return sdkMessage.message.content.every((block: any) => block.type === 'tool_use');
  }

  private addToolUseBreadcrumb(sdkMessage: any): void {
    const content = sdkMessage.message?.content;
    if (!content || !Array.isArray(content)) return;

    // Process each tool_use block
    content.forEach((block: any) => {
      if (block.type !== 'tool_use') return;
      
      // Create a clean tool_use message without formatting
      const toolMessage: UIMessage = {
        id: block.id || `tool-${Date.now()}-${Math.random()}`,
        type: "tool_use" as any, // Will be handled by MessageRenderer
        content: block, // Store the raw tool block
        toolUseId: block.id,  // Store the tool use ID for result association
        sequenceNumber: sdkMessage.metadata?.cmuxMeta?.sequenceNumber ?? 
                      sdkMessage._sequenceNumber ?? 
                      this.sequenceCounter++,
        timestamp: Date.now(),
        metadata: { 
          originalSDKMessage: sdkMessage,
          toolName: block.name,
          toolInput: block.input
        },
      };
      
      // Store in both maps for lookup
      this.uiMessages.set(toolMessage.id, toolMessage);
      if (block.id) {
        this.toolUseMap.set(block.id, toolMessage);
      }
    });
  }

  private extractAssistantContent(sdkMessage: any): string {
    if (sdkMessage.message?.content) {
      const content = sdkMessage.message.content;
      
      // Handle array of content blocks
      if (Array.isArray(content)) {
        return content.map((block: any) => {
          if (typeof block === 'string') {
            return block;
          } else if (block.text) {
            return block.text;
          } else if (block.type) {
            // For non-text content blocks, show as JSON
            return typeof block.content === 'string' 
              ? block.content 
              : JSON.stringify(block.content || block, null, 2);
          }
          return '';
        }).join('');
      }
      
      // Handle string content
      if (typeof content === 'string') {
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

  private handleToolResult(sdkMessage: any): void {
    // Extract tool result data
    const toolUseId = sdkMessage.tool_use_id;
    const content = sdkMessage.content;
    const isError = sdkMessage.is_error || false;
    
    // Look up the corresponding tool_use message
    const toolUseMessage = toolUseId ? this.toolUseMap.get(toolUseId) : null;
    
    // Create tool_result message with association
    const resultMessage: UIMessage = {
      id: sdkMessage.uuid || `tool-result-${Date.now()}`,
      type: "tool_result" as any,
      content: content,
      toolUseId: toolUseId,
      toolResult: {
        content: content,
        is_error: isError
      },
      sequenceNumber: sdkMessage.metadata?.cmuxMeta?.sequenceNumber ?? 
                      sdkMessage._sequenceNumber ?? 
                      this.sequenceCounter++,
      timestamp: Date.now(),
      metadata: {
        originalSDKMessage: sdkMessage
      }
    };
    
    // Add associated tool use data if found
    if (toolUseMessage) {
      resultMessage.associatedToolUse = {
        name: toolUseMessage.metadata?.toolName || 'unknown',
        input: toolUseMessage.metadata?.toolInput
      };
    }
    
    this.uiMessages.set(resultMessage.id, resultMessage);
  }

  clear() {
    this.uiMessages.clear();
    this.activeStreams.clear();
    this.toolUseMap.clear();
    this.sequenceCounter = 0;
    this.availableCommands = [];
  }
  
  getAvailableCommands(): string[] {
    return this.availableCommands;
  }
}