import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

// Simplified aggregator for debug CLI - matches main logic
class StreamingMessageAggregator {
  private uiMessages: Map<string, any> = new Map();
  private activeStreams: Map<string, any> = new Map();
  private sequenceCounter: number = 0;

  processSDKMessage(sdkMessage: any): void {
    switch (sdkMessage.type) {
      case 'user':
        this.addUserMessage(sdkMessage);
        break;
      case 'system':
        if (sdkMessage.subtype === 'init') {
          this.addSystemMessage(sdkMessage);
        }
        break;
      case 'stream_event':
        this.handleStreamEvent(sdkMessage);
        break;
      case 'assistant':
        this.handleAssistantMessage(sdkMessage);
        break;
      case 'result':
        this.addResultBreadcrumb(sdkMessage);
        break;
    }
  }

  getAllMessages(): any[] {
    return Array.from(this.uiMessages.values()).sort((a, b) => {
      return a.sequenceNumber - b.sequenceNumber;
    });
  }

  private addUserMessage(sdkMessage: any): void {
    const userMessage = {
      id: sdkMessage.uuid || `user-${Date.now()}`,
      type: 'user',
      content: sdkMessage.message?.content || '',
      sequenceNumber: sdkMessage._sequenceNumber || this.sequenceCounter++,
    };
    this.uiMessages.set(userMessage.id, userMessage);
  }

  private addSystemMessage(sdkMessage: any): void {
    const systemMessage = {
      id: sdkMessage.uuid || `system-${Date.now()}`,
      type: 'system',
      content: `Session initialized - Model: ${sdkMessage.model || 'unknown'}`,
      isBreadcrumb: true,
      sequenceNumber: sdkMessage._sequenceNumber || this.sequenceCounter++,
    };
    this.uiMessages.set(systemMessage.id, systemMessage);
  }

  private addResultBreadcrumb(sdkMessage: any): void {
    const resultMessage = {
      id: sdkMessage.uuid || `result-${Date.now()}`,
      type: 'result',
      content: sdkMessage.result || 'Success',
      isBreadcrumb: true,
      sequenceNumber: sdkMessage._sequenceNumber || this.sequenceCounter++,
    };
    this.uiMessages.set(resultMessage.id, resultMessage);
  }

  private handleStreamEvent(sdkMessage: any): void {
    const event = sdkMessage.event;
    if (!event) return;

    switch (event.type) {
      case 'message_start':
        this.startStreamingMessage(sdkMessage);
        break;
      case 'content_block_delta':
        this.updateStreamingMessage(sdkMessage);
        break;
      case 'message_stop':
        this.finishStreamingMessage(sdkMessage);
        break;
    }
  }

  private startStreamingMessage(sdkMessage: any): void {
    const streamingId = sdkMessage.event.message?.id || `stream-${Date.now()}`;
    const messageId = `streaming-${streamingId}`;

    this.activeStreams.set(streamingId, {
      streamingId,
      messageId,
      contentParts: [],
      startTime: Date.now(),
    });

    const streamingMessage = {
      id: messageId,
      type: 'assistant',
      content: '',
      isStreaming: true,
      sequenceNumber: sdkMessage._sequenceNumber || this.sequenceCounter++,
    };
    
    this.uiMessages.set(messageId, streamingMessage);
  }

  private updateStreamingMessage(sdkMessage: any): void {
    const streamingId = this.findStreamingIdFromEvent();
    if (!streamingId) return;

    const context = this.activeStreams.get(streamingId);
    if (!context) return;

    const deltaText = sdkMessage.event.delta?.text || '';
    context.contentParts.push(deltaText);

    // Update existing message in Map
    const existingMessage = this.uiMessages.get(context.messageId);
    if (existingMessage) {
      this.uiMessages.set(context.messageId, {
        ...existingMessage,
        content: context.contentParts.join(''),
        isStreaming: true,
      });
    }
  }

  private finishStreamingMessage(sdkMessage: any): void {
    const streamingId = this.findStreamingIdFromEvent();
    if (!streamingId) return;

    const context = this.activeStreams.get(streamingId);
    if (!context) return;

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
      // Replace most recent streaming message with final assistant content
      const context = activeStreams[activeStreams.length - 1];
      
      const finalMessage = {
        id: context.messageId,
        type: 'assistant',
        content: this.extractAssistantContent(sdkMessage),
        isStreaming: false,
        sequenceNumber: sdkMessage._sequenceNumber || this.sequenceCounter++,
      };
      
      this.uiMessages.set(context.messageId, finalMessage);
      this.activeStreams.delete(context.streamingId);
    } else {
      // Standalone assistant message
      const assistantMessage = {
        id: sdkMessage.uuid || `assistant-${Date.now()}`,
        type: 'assistant',
        content: this.extractAssistantContent(sdkMessage),
        sequenceNumber: sdkMessage._sequenceNumber || this.sequenceCounter++,
      };
      
      this.uiMessages.set(assistantMessage.id, assistantMessage);
    }
  }

  private extractAssistantContent(sdkMessage: any): string {
    if (sdkMessage.message?.content) {
      if (Array.isArray(sdkMessage.message.content)) {
        return sdkMessage.message.content.map((c: any) => c.text || '').join('');
      }
      return sdkMessage.message.content;
    }
    return '(No content)';
  }

  private findStreamingIdFromEvent(): string | null {
    const recentStreams = Array.from(this.activeStreams.keys());
    return recentStreams.length > 0 ? recentStreams[recentStreams.length - 1] : null;
  }

  clear() {
    this.uiMessages.clear();
    this.activeStreams.clear();
    this.sequenceCounter = 0;
  }
}

export async function uiMessagesCommand(workspaceKey?: string, dropLast: number = 0) {
  if (!workspaceKey) {
    console.error('Error: --workspace required');
    process.exit(1);
  }

  try {
    // Load workspace data
    const workspaceFile = join(homedir(), '.cmux', 'workspaces', workspaceKey, 'session.json');
    const data = JSON.parse(await readFile(workspaceFile, 'utf-8'));
    
    // Drop last N messages if requested
    const messagesToProcess = dropLast > 0 
      ? data.history.slice(0, -dropLast)
      : data.history;
    
    // Process through same aggregator as UI
    const aggregator = new StreamingMessageAggregator();
    
    messagesToProcess.forEach((sdkMsg: any) => {
      aggregator.processSDKMessage(sdkMsg);
    });
    
    const uiMessages = aggregator.getAllMessages();
    
    // Display clean summary
    console.log(`\nUI Messages for workspace: ${workspaceKey}`);
    console.log(`Total SDK messages: ${data.history.length}`);
    if (dropLast > 0) {
      console.log(`Processed SDK messages: ${messagesToProcess.length} (dropped last ${dropLast})`);
    }
    console.log(`Total UI messages: ${uiMessages.length}`);
    console.log('---\n');
    
    uiMessages.forEach((msg, i) => {
      const streamingInfo = msg.isStreaming ? ' [STREAMING]' : '';
      const preview = msg.content.slice(0, 60).replace(/\n/g, '\\n');
      console.log(`${i + 1}. [${msg.type}]${streamingInfo} ${preview}${msg.content.length > 60 ? '...' : ''}`);
    });
    
    console.log('\n');
  } catch (error) {
    console.error(`Error reading workspace ${workspaceKey}:`, error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}