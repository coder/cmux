import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import styled from '@emotion/styled';
import { ClaudeMessage } from './ClaudeMessage';
import { UIMessage, StreamingContext } from '../types/claude';

class StreamingMessageAggregator {
  private activeStreams: Map<string, StreamingContext> = new Map();
  private sequenceCounter: number = 0;

  processSDKMessage(sdkMessage: any): UIMessage[] {
    const results: UIMessage[] = [];

    switch (sdkMessage.type) {
      case 'user':
        results.push(this.createUserMessage(sdkMessage));
        break;
        
      case 'system':
        if (sdkMessage.subtype === 'init') {
          results.push(this.createSystemMessage(sdkMessage));
        }
        break;
        
      case 'stream_event':
        const streamResult = this.handleStreamEvent(sdkMessage);
        if (streamResult) results.push(streamResult);
        break;
        
      case 'assistant':
        const assistantResult = this.handleAssistantMessage(sdkMessage);
        if (assistantResult) results.push(assistantResult);
        break;
        
      case 'result':
        results.push(this.createResultMessage(sdkMessage));
        break;
    }

    return results;
  }

  private createUserMessage(sdkMessage: any): UIMessage {
    return {
      id: sdkMessage.uuid || `user-${Date.now()}`,
      type: 'user',
      content: sdkMessage.message?.content || '',
      sequenceNumber: sdkMessage._sequenceNumber || this.sequenceCounter++,
      timestamp: sdkMessage.timestamp || Date.now(),
      metadata: { originalSDKMessage: sdkMessage }
    };
  }

  private createSystemMessage(sdkMessage: any): UIMessage {
    return {
      id: sdkMessage.uuid || `system-${Date.now()}`,
      type: 'system',
      content: `Session initialized\nModel: ${sdkMessage.model || 'unknown'}\nTools: ${sdkMessage.tools?.length || 0} available`,
      sequenceNumber: sdkMessage._sequenceNumber || this.sequenceCounter++,
      timestamp: Date.now(),
      metadata: { originalSDKMessage: sdkMessage }
    };
  }

  private handleStreamEvent(sdkMessage: any): UIMessage | null {
    const event = sdkMessage.event;
    if (!event) return null;

    switch (event.type) {
      case 'message_start':
        return this.startStreamingMessage(sdkMessage);
      case 'content_block_delta':
        return this.updateStreamingMessage(sdkMessage);
      case 'message_stop':
        return this.finishStreamingMessage(sdkMessage);
      default:
        return null;
    }
  }

  private startStreamingMessage(sdkMessage: any): UIMessage {
    const streamingId = sdkMessage.event.message?.id || `stream-${Date.now()}`;
    const messageId = `streaming-${streamingId}`;
    
    const context: StreamingContext = {
      streamingId,
      messageId,
      contentParts: [],
      startTime: Date.now(),
      isComplete: false
    };
    
    this.activeStreams.set(streamingId, context);

    return {
      id: messageId,
      type: 'assistant',
      content: '',
      isStreaming: true,
      sequenceNumber: sdkMessage._sequenceNumber || this.sequenceCounter++,
      timestamp: Date.now(),
      metadata: { streamingId, originalSDKMessage: sdkMessage }
    };
  }

  private updateStreamingMessage(sdkMessage: any): UIMessage | null {
    const streamingId = this.findStreamingIdFromEvent(sdkMessage);
    if (!streamingId) return null;

    const context = this.activeStreams.get(streamingId);
    if (!context) return null;

    const deltaText = sdkMessage.event.delta?.text || '';
    context.contentParts.push(deltaText);

    return {
      id: context.messageId,
      type: 'assistant',
      content: context.contentParts.join(''),
      isStreaming: true,
      sequenceNumber: sdkMessage._sequenceNumber || this.sequenceCounter++,
      timestamp: context.startTime,
      metadata: { streamingId, originalSDKMessage: sdkMessage }
    };
  }

  private finishStreamingMessage(sdkMessage: any): UIMessage | null {
    const streamingId = this.findStreamingIdFromEvent(sdkMessage);
    if (!streamingId) return null;

    const context = this.activeStreams.get(streamingId);
    if (!context) return null;

    context.isComplete = true;
    
    return {
      id: context.messageId,
      type: 'assistant',
      content: context.contentParts.join(''),
      isStreaming: false,
      sequenceNumber: sdkMessage._sequenceNumber || this.sequenceCounter++,
      timestamp: context.startTime,
      metadata: { streamingId, originalSDKMessage: sdkMessage }
    };
  }

  private handleAssistantMessage(sdkMessage: any): UIMessage | null {
    // Replace streaming message with final assistant message
    const messageId = sdkMessage.event?.message?.id || sdkMessage.uuid;
    const streamingContext = Array.from(this.activeStreams.values())
      .find(ctx => ctx.streamingId === messageId);

    if (streamingContext) {
      // Clean up streaming context
      this.activeStreams.delete(streamingContext.streamingId);
      
      return {
        id: streamingContext.messageId,
        type: 'assistant',
        content: this.extractAssistantContent(sdkMessage),
        isStreaming: false,
        sequenceNumber: sdkMessage._sequenceNumber || this.sequenceCounter++,
        timestamp: streamingContext.startTime,
        metadata: { originalSDKMessage: sdkMessage }
      };
    }

    // Standalone assistant message
    return {
      id: sdkMessage.uuid || `assistant-${Date.now()}`,
      type: 'assistant',
      content: this.extractAssistantContent(sdkMessage),
      sequenceNumber: sdkMessage._sequenceNumber || this.sequenceCounter++,
      timestamp: Date.now(),
      metadata: { originalSDKMessage: sdkMessage }
    };
  }

  private createResultMessage(sdkMessage: any): UIMessage {
    return {
      id: sdkMessage.uuid || `result-${Date.now()}`,
      type: 'result',
      content: `${sdkMessage.subtype || 'completed'}: ${sdkMessage.result || 'Success'}`,
      sequenceNumber: sdkMessage._sequenceNumber || this.sequenceCounter++,
      timestamp: Date.now(),
      metadata: { 
        originalSDKMessage: sdkMessage,
        cost: sdkMessage.total_cost_usd,
        duration: sdkMessage.duration_ms
      }
    };
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

  private findStreamingIdFromEvent(sdkMessage: any): string | null {
    // Try to find streaming ID from session context
    // This is a heuristic since stream events don't always have direct message ID references
    const recentStreams = Array.from(this.activeStreams.keys());
    return recentStreams.length > 0 ? recentStreams[recentStreams.length - 1] : null;
  }

  clear() {
    this.activeStreams.clear();
    this.sequenceCounter = 0;
  }
}

const ViewContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  overflow: hidden;
`;

const ViewHeader = styled.div`
  padding: 10px 15px;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const WorkspaceTitle = styled.div`
  font-weight: 600;
  color: #cccccc;
`;

const StatusIndicator = styled.div<{ active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: ${props => props.active ? '#4ec9b0' : '#6b6b6b'};
  
  &::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${props => props.active ? '#4ec9b0' : '#6b6b6b'};
  }
`;

const OutputContent = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 15px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
`;

const InputSection = styled.div`
  padding: 15px;
  background: #252526;
  border-top: 1px solid #3e3e42;
  display: flex;
  gap: 10px;
  align-items: flex-end;
`;

const InputField = styled.textarea`
  flex: 1;
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  color: #d4d4d4;
  padding: 8px 12px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 13px;
  resize: vertical;
  min-height: 36px;
  max-height: 120px;
  
  &:focus {
    outline: none;
    border-color: #569cd6;
  }
  
  &::placeholder {
    color: #6b6b6b;
  }
`;

const SendButton = styled.button`
  background: #0e639c;
  border: none;
  color: white;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  
  &:hover {
    background: #1177bb;
  }
  
  &:disabled {
    background: #3e3e42;
    cursor: not-allowed;
    color: #6b6b6b;
  }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #6b6b6b;
  text-align: center;
  
  h3 {
    margin: 0 0 10px 0;
    font-size: 16px;
    font-weight: 500;
  }
  
  p {
    margin: 0;
    font-size: 13px;
  }
`;


interface ClaudeViewProps {
  projectName?: string;
  branch?: string;
  className?: string;
}

export const ClaudeView: React.FC<ClaudeViewProps> = ({
  projectName,
  branch,
  className
}) => {
  const [uiMessageMap, setUIMessageMap] = useState<Map<string, UIMessage>>(new Map());
  const [isActive, setIsActive] = useState(false);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const aggregatorRef = useRef<StreamingMessageAggregator>(new StreamingMessageAggregator());

  // Process SDK message and convert to UI messages
  const processSDKMessage = useCallback((sdkMessage: any) => {
    const uiMessages = aggregatorRef.current.processSDKMessage(sdkMessage);
    
    setUIMessageMap(prev => {
      const newMap = new Map(prev);
      uiMessages.forEach(uiMessage => {
        newMap.set(uiMessage.id, uiMessage);
      });
      return newMap;
    });
  }, []);

  // Load output function
  const loadOutput = useCallback(async () => {
    if (!projectName || !branch) return;
    
    try {
      const output = await window.api.claude.getOutput(projectName, branch);
      const sdkMessages = output || [];
      
      // Clear existing messages and aggregator
      setUIMessageMap(new Map());
      aggregatorRef.current.clear();
      
      // Process all SDK messages through aggregator
      sdkMessages.forEach(processSDKMessage);
      
      // Auto-scroll to bottom after loading
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
      }, 50);
    } catch (error) {
      console.error('Failed to load output:', error);
    }
  }, [projectName, branch, processSDKMessage]);

  // Computed UI messages array derived from uiMessageMap
  const messages = useMemo(() => {
    return Array.from(uiMessageMap.values()).sort((a, b) => {
      return a.sequenceNumber - b.sequenceNumber;
    });
  }, [uiMessageMap]);
  
  useEffect(() => {
    if (!projectName || !branch) return;
    
    // Clear messages when switching workspaces
    setUIMessageMap(new Map());
    aggregatorRef.current.clear();
    
    // Load initial output
    loadOutput();
    
    // Check if workspace is active
    checkStatus();
    
    // Subscribe to output updates
    const unsubscribe = window.api.claude.onOutput((data: any) => {
      if (data.projectName === projectName && data.branch === branch) {
        processSDKMessage(data.message);
        
        // Auto-scroll to bottom
        setTimeout(() => {
          if (contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
          }
        }, 50);
      }
    });
    
    // Poll status periodically
    const statusInterval = setInterval(checkStatus, 5000);
    
    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
      clearInterval(statusInterval);
    };
  }, [projectName, branch, loadOutput, processSDKMessage]);
  
  const checkStatus = async () => {
    if (!projectName || !branch) return;
    
    try {
      const active = await window.api.claude.isActive(projectName, branch);
      setIsActive(active);
    } catch (error) {
      console.error('Failed to check status:', error);
    }
  };
  
  const handleSend = async () => {
    if (!input.trim() || !projectName || !branch || isSending) return;
    
    setIsSending(true);
    try {
      const messageText = input.trim();
      setInput(''); // Clear input immediately for better UX
      
      // Send message to Claude workspace
      const success = await window.api.claude.sendMessage(projectName, branch, messageText);
      
      if (!success) {
        console.error('Failed to send message to Claude workspace');
        // Optionally restore the input or show an error message
        setInput(messageText);
        return;
      }
      
      console.log('Message sent successfully:', messageText);
      
    } catch (error) {
      console.error('Failed to send message:', error);
      // Restore the input on error
      setInput(input);
    } finally {
      setIsSending(false);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift+Enter: allow newline (default behavior)
        return;
      } else {
        // Enter: send message
        e.preventDefault();
        handleSend();
      }
    }
  };
  
  
  if (!projectName || !branch) {
    return (
      <ViewContainer className={className}>
        <EmptyState>
          <h3>No Workspace Selected</h3>
          <p>Select a workspace from the sidebar to view and interact with Claude</p>
        </EmptyState>
      </ViewContainer>
    );
  }
  
  return (
    <ViewContainer className={className}>
      <ViewHeader>
        <WorkspaceTitle>{projectName} / {branch}</WorkspaceTitle>
        <StatusIndicator active={isActive}>
          {isActive ? 'Active' : 'Inactive'}
        </StatusIndicator>
      </ViewHeader>
      
      <OutputContent ref={contentRef}>
        {messages.length === 0 ? (
          <EmptyState>
            <h3>No Messages Yet</h3>
            <p>Send a message below to start interacting with Claude</p>
          </EmptyState>
        ) : (
          messages.map((msg, index) => (
            <ClaudeMessage key={index} message={msg} />
          ))
        )}
      </OutputContent>
      
      <InputSection>
        <InputField
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isActive ? "Type your message... (Enter to send, Shift+Enter for newline)" : "Start workspace to send messages"}
          disabled={!isActive || isSending}
          rows={1}
        />
        <SendButton
          onClick={handleSend}
          disabled={!input.trim() || !isActive || isSending}
        >
          {isSending ? 'Sending...' : 'Send'}
        </SendButton>
      </InputSection>
    </ViewContainer>
  );
};