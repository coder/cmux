import React from 'react';
import styled from '@emotion/styled';
import { Message } from '../../types/claude';
import { TypewriterText } from '../ClaudeMessage/TypewriterText';

const MessageBlock = styled.div`
  margin-bottom: 15px;
  margin-top: 15px;
  background: #1e1e1e;
  border-left: 3px solid #d4a853;
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

const StreamingIndicator = styled.span`
  font-size: 10px;
  color: #d4a853;
  font-style: italic;
  animation: pulse 1.5s ease-in-out infinite;
  
  @keyframes pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
`;

const MessageContent = styled.div`
  padding: 12px;
`;

const FormattedContent = styled.div`
  margin: 0;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: #d4d4d4;
`;

interface StreamingMessageProps {
  message: Message;
  className?: string;
}

export const StreamingMessage: React.FC<StreamingMessageProps> = ({ message, className }) => {
  const hasDeltas = message.contentDeltas && message.contentDeltas.length > 0;
  
  return (
    <MessageBlock className={className}>
      <MessageHeader>
        <MessageTypeLabel>ASSISTANT</MessageTypeLabel>
        <StreamingIndicator>streaming...</StreamingIndicator>
      </MessageHeader>
      <MessageContent>
        <FormattedContent>
          {hasDeltas ? (
            <TypewriterText 
              deltas={message.contentDeltas!} 
              isComplete={false}
              speed={50}
            />
          ) : (
            <span>Waiting for response...</span>
          )}
        </FormattedContent>
      </MessageContent>
    </MessageBlock>
  );
};