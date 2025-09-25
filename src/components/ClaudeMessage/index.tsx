import React, { useState } from 'react';
import styled from '@emotion/styled';

const MessageBlock = styled.div<{ type: string; isError?: boolean }>`
  margin-bottom: 15px;
  background: ${props => {
    switch(props.type) {
      case 'user': return '#2d2d30';
      case 'assistant': return '#1e1e1e';
      case 'system': return '#1a1d29';
      case 'result': return props.isError ? '#3c1f1f' : '#1f3c1f';
      case 'stream_event': return '#1a1d29';
      default: return '#1e1e1e';
    }
  }};
  border-left: 3px solid ${props => {
    switch(props.type) {
      case 'user': return '#569cd6';
      case 'assistant': return '#4ec9b0';
      case 'system': return '#808080';
      case 'result': return props.isError ? '#f48771' : '#b5cea8';
      case 'stream_event': return '#d4a853';
      default: return '#3e3e42';
    }
  }};
  border-radius: 3px;
  overflow: hidden;
`;

const MessageHeader = styled.div`
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #cccccc;
  font-weight: 500;
`;

const MessageTypeLabel = styled.div`
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const ToggleButton = styled.button`
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #cccccc;
  padding: 2px 8px;
  border-radius: 3px;
  cursor: pointer;
  font-size: 10px;
  transition: all 0.2s ease;
  
  &:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.3);
  }
  
  &:active {
    background: rgba(255, 255, 255, 0.15);
  }
`;

const MessageContent = styled.div`
  padding: 12px;
`;

const FormattedContent = styled.pre`
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
`;

const JsonContent = styled.pre`
  margin: 0;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 11px;
  line-height: 1.4;
  white-space: pre-wrap;
  color: #d4d4d4;
  background: rgba(0, 0, 0, 0.3);
  padding: 8px;
  border-radius: 3px;
  overflow-x: auto;
`;

const PartialIndicator = styled.div`
  font-size: 10px;
  color: #d4a853;
  margin-bottom: 4px;
  font-style: italic;
`;

interface ClaudeMessageProps {
  message: any;
  className?: string;
}

export const ClaudeMessage: React.FC<ClaudeMessageProps> = ({ message, className }) => {
  const [showJson, setShowJson] = useState(false);
  
  const getMessageType = (msg: any): string => {
    if (msg.type) return msg.type;
    if (msg.role) return msg.role;
    if (msg.subtype) return msg.subtype;
    return 'unknown';
  };
  
  const getMessageSubtype = (msg: any): string | undefined => {
    return msg.subtype;
  };
  
  const getHeaderText = (msg: any): string => {
    const type = getMessageType(msg);
    const subtype = getMessageSubtype(msg);
    
    if (subtype && type !== subtype) {
      return `${type} / ${subtype}`;
    }
    return type;
  };
  
  const formatMessageContent = (msg: any): string => {
    if (typeof msg === 'string') {
      return msg;
    }
    
    // Handle SDK assistant messages
    if (msg.type === 'assistant' && msg.message?.content) {
      if (Array.isArray(msg.message.content)) {
        return msg.message.content.map((c: any) => c.text || JSON.stringify(c, null, 2)).join('\n');
      }
      return typeof msg.message.content === 'string' 
        ? msg.message.content 
        : JSON.stringify(msg.message.content, null, 2);
    }
    
    // Handle SDK user messages
    if (msg.type === 'user' && msg.message?.content) {
      return typeof msg.message.content === 'string' 
        ? msg.message.content 
        : JSON.stringify(msg.message.content, null, 2);
    }
    
    // Handle stream events
    if (msg.type === 'stream_event' && msg.event) {
      if (msg.event.type === 'content_block_delta' && msg.event.delta?.text) {
        return msg.event.delta.text;
      }
      if (msg.event.type === 'content_block_start' && msg.event.content_block?.text) {
        return msg.event.content_block.text;
      }
    }
    
    // Handle system messages
    if (msg.type === 'system') {
      if (msg.subtype === 'init') {
        return `Session initialized in ${msg.cwd}\nModel: ${msg.model}\nTools: ${msg.tools?.join(', ') || 'none'}`;
      }
      if (msg.subtype === 'compact_boundary') {
        return `Conversation compacted (${msg.compact_metadata?.trigger || 'unknown'} trigger)`;
      }
    }
    
    // Handle result messages
    if (msg.type === 'result') {
      if (msg.subtype === 'success' && msg.result) {
        return msg.result;
      }
      if (msg.subtype === 'error_max_turns') {
        return 'Maximum number of conversation turns reached';
      }
      if (msg.subtype === 'error_during_execution') {
        return 'Error occurred during execution';
      }
    }
    
    // Handle direct content property
    if (msg.content) {
      if (Array.isArray(msg.content)) {
        return msg.content.map((c: any) => c.text || JSON.stringify(c, null, 2)).join('\n');
      }
      return typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2);
    }
    
    // Default: show formatted JSON
    return JSON.stringify(msg, null, 2);
  };
  
  const isPartialMessage = (msg: any): boolean => {
    return msg.type === 'stream_event' || 
           (msg.event && ['content_block_delta', 'content_block_start'].includes(msg.event.type));
  };
  
  const hasFormattableContent = (msg: any): boolean => {
    const type = getMessageType(msg);
    return ['assistant', 'user', 'system', 'result', 'stream_event'].includes(type) ||
           msg.content || msg.message?.content;
  };
  
  const type = getMessageType(message);
  const headerText = getHeaderText(message);
  const formattedContent = formatMessageContent(message);
  const canFormat = hasFormattableContent(message);
  
  return (
    <MessageBlock type={type} isError={message.error} className={className}>
      <MessageHeader>
        <MessageTypeLabel>{headerText}</MessageTypeLabel>
        {canFormat && (
          <ToggleButton onClick={() => setShowJson(!showJson)}>
            {showJson ? 'Hide JSON' : 'Show JSON'}
          </ToggleButton>
        )}
      </MessageHeader>
      
      <MessageContent>
        {isPartialMessage(message) && (
          <PartialIndicator>streaming...</PartialIndicator>
        )}
        
        {showJson ? (
          <JsonContent>{JSON.stringify(message, null, 2)}</JsonContent>
        ) : (
          <FormattedContent>{formattedContent}</FormattedContent>
        )}
      </MessageContent>
    </MessageBlock>
  );
};