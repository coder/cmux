import React from 'react';
import styled from '@emotion/styled';
import { Message } from '../../types/claude';

const MessageBlock = styled.div`
  margin-bottom: 15px;
  margin-top: 15px;
  background: #2d2d30;
  border-left: 3px solid #569cd6;
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

const MessageContent = styled.div`
  padding: 12px;
`;

const FormattedContent = styled.pre`
  margin: 0;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: #cccccc;
`;

interface UserMessageProps {
  message: Message;
  className?: string;
}

export const UserMessage: React.FC<UserMessageProps> = ({ message, className }) => {
  const content = typeof message.content === 'string' 
    ? message.content 
    : JSON.stringify(message.content, null, 2);
  
  return (
    <MessageBlock className={className}>
      <MessageHeader>
        <MessageTypeLabel>USER</MessageTypeLabel>
      </MessageHeader>
      <MessageContent>
        <FormattedContent>{content}</FormattedContent>
      </MessageContent>
    </MessageBlock>
  );
};