import React, { useState } from 'react';
import styled from '@emotion/styled';
import { UIMessage } from '../../types/claude';

const DebugContainer = styled.div`
  margin: 2px 0;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.02);
  border-left: 1px dashed rgba(255, 255, 255, 0.1);
  font-size: 9px;
  color: #505050;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  cursor: pointer;
  opacity: 0.5;
  transition: opacity 0.2s ease;
  
  &:hover {
    opacity: 0.8;
    background: rgba(255, 255, 255, 0.03);
  }
`;

const DebugHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
`;

const DebugIcon = styled.span`
  font-size: 8px;
  opacity: 0.6;
`;

const DebugLabel = styled.span`
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 8px;
`;

const DebugInfo = styled.span`
  color: #606060;
  margin-left: 4px;
`;

const JsonContent = styled.pre`
  margin: 4px 0 2px 12px;
  font-size: 9px;
  line-height: 1.3;
  color: #606060;
  background: rgba(0, 0, 0, 0.2);
  padding: 4px 6px;
  border-radius: 2px;
  overflow-x: auto;
  max-height: 200px;
  overflow-y: auto;
`;

interface DebugMessageProps {
  message: UIMessage;
  className?: string;
}

export const DebugMessage: React.FC<DebugMessageProps> = ({ message, className }) => {
  const [expanded, setExpanded] = useState(false);
  
  // Determine what kind of debug message this is
  const getDebugInfo = () => {
    const original = message.metadata?.originalSDKMessage;
    
    // Stream event messages
    if (original?.type === 'stream_event') {
      const eventType = original.event?.type || 'unknown';
      return {
        label: 'STREAM',
        info: eventType
      };
    }
    
    // Empty assistant messages
    if (message.type === 'assistant' && (!message.content || message.content === '')) {
      return {
        label: 'EMPTY',
        info: 'assistant message'
      };
    }
    
    // Default debug info
    return {
      label: 'DEBUG',
      info: `${message.type} #${message.sequenceNumber}`
    };
  };
  
  const { label, info } = getDebugInfo();
  
  return (
    <div className={className}>
      <DebugContainer onClick={() => setExpanded(!expanded)}>
        <DebugHeader>
          <DebugIcon>{expanded ? '▼' : '▶'}</DebugIcon>
          <DebugLabel>{label}</DebugLabel>
          <DebugInfo>{info}</DebugInfo>
        </DebugHeader>
      </DebugContainer>
      
      {expanded && (
        <JsonContent>
          {JSON.stringify(message.metadata?.originalSDKMessage || message, null, 2)}
        </JsonContent>
      )}
    </div>
  );
};