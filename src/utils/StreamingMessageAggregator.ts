import { UIMessage, StreamingContext } from "../types/claude";

export class StreamingMessageAggregator {
  private uiMessages: Map<string, UIMessage> = new Map();
  private activeStreams: Map<string, StreamingContext> = new Map();
  private sequenceCounter: number = 0;
  private availableCommands: string[] = [];

  // IMPORTANT: This method MUST handle ALL message types from the SDK
  // and display them using the best available UI component.
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
    }
  }

  getAllMessages(): UIMessage[] {
    return Array.from(this.uiMessages.values()).sort((a, b) => {
      return a.sequenceNumber - b.sequenceNumber;
    });
  }

  private addUserMessage(sdkMessage: any): void {
    const userMessage: UIMessage = {
      id: sdkMessage.uuid || `user-${Date.now()}`,
      type: "user",
      content: sdkMessage.message?.content || "",
      sequenceNumber: sdkMessage._sequenceNumber || this.sequenceCounter++,
      timestamp: sdkMessage.timestamp || Date.now(),
      metadata: { originalSDKMessage: sdkMessage },
    };
    this.uiMessages.set(userMessage.id, userMessage);
  }

  private addSystemMessage(sdkMessage: any): void {
    let content: string;
    
    // Handle different system message subtypes
    switch (sdkMessage.subtype) {
      case 'init':
        // Extract available commands from system/init messages
        if (sdkMessage.slash_commands) {
          this.availableCommands = sdkMessage.slash_commands;
        }
        content = `Session initialized - Model: ${sdkMessage.model || "unknown"} - Tools: ${sdkMessage.tools?.length || 0} available`;
        break;
        
      case 'compact_boundary':
        const metadata = sdkMessage.compact_metadata || {};
        const trigger = metadata.trigger === 'manual' ? 'Manual' : 'Automatic';
        const preTokens = metadata.pre_tokens || 0;
        content = `📦 ${trigger} compaction completed - Compressed ${preTokens.toLocaleString()} tokens`;
        break;
        
      default:
        // Fallback for any other system messages
        content = sdkMessage.content || `System message: ${sdkMessage.subtype || 'unknown'}`;
        break;
    }
    
    const systemMessage: UIMessage = {
      id: sdkMessage.uuid || `system-${Date.now()}`,
      type: "system",
      content,
      isBreadcrumb: true,
      sequenceNumber: sdkMessage._sequenceNumber || this.sequenceCounter++,
      timestamp: Date.now(),
      metadata: { originalSDKMessage: sdkMessage },
    };
    this.uiMessages.set(systemMessage.id, systemMessage);
  }

  private addResultBreadcrumb(sdkMessage: any): void {
    const resultMessage: UIMessage = {
      id: sdkMessage.uuid || `result-${Date.now()}`,
      type: "result",
      content: sdkMessage.result || "Success",
      isBreadcrumb: true,
      sequenceNumber: sdkMessage._sequenceNumber || this.sequenceCounter++,
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

    switch (event.type) {
      case "message_start":
        this.startStreamingMessage(sdkMessage);
        break;
      case "content_block_delta":
        this.updateStreamingMessage(sdkMessage);
        break;
      case "message_stop":
        this.finishStreamingMessage(sdkMessage);
        break;
      default:
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
      sequenceNumber: sdkMessage._sequenceNumber || this.sequenceCounter++,
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

  private finishStreamingMessage(sdkMessage: any): void {
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
        sequenceNumber: sdkMessage._sequenceNumber || this.sequenceCounter++,
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
        sequenceNumber: sdkMessage._sequenceNumber || this.sequenceCounter++,
        timestamp: sdkMessage.timestamp || Date.now(),
        metadata: { originalSDKMessage: sdkMessage },
      };
      
      this.uiMessages.set(assistantMessage.id, assistantMessage);
    }
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

  clear() {
    this.uiMessages.clear();
    this.activeStreams.clear();
    this.sequenceCounter = 0;
    this.availableCommands = [];
  }
  
  getAvailableCommands(): string[] {
    return this.availableCommands;
  }
}