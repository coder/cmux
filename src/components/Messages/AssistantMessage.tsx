import React, { useState } from 'react';
import styled from '@emotion/styled';
import { Message } from '../../types/claude';
import { MarkdownRenderer } from './MarkdownRenderer';

const MessageBlock = styled.div`
  margin-bottom: 15px;
  margin-top: 15px;
  background: #1e1e1e;
  border-left: 3px solid #4ec9b0;
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
`;

const MessageContent = styled.div`
  padding: 12px;
`;


const JsonContent = styled.pre`
  margin: 0;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 11px;
  line-height: 1.4;
  white-space: pre-wrap;
  color: #d4d4d4;
  background: rgba(0, 0, 0, 0.3);
  padding: 8px;
  border-radius: 3px;
  overflow-x: auto;
`;

interface AssistantMessageProps {
  message: Message;
  className?: string;
}

export const AssistantMessage: React.FC<AssistantMessageProps> = ({ message, className }) => {
  const [showJson, setShowJson] = useState(false);
  
  const content = extractContent(message);
  
  return (
    <MessageBlock className={className}>
      <MessageHeader>
        <MessageTypeLabel>ASSISTANT</MessageTypeLabel>
        <ToggleButton onClick={() => setShowJson(!showJson)}>
          {showJson ? "Hide JSON" : "Show JSON"}
        </ToggleButton>
      </MessageHeader>
      <MessageContent>
        {showJson ? (
          <JsonContent>
            {JSON.stringify(
              message.metadata?.originalSDKMessage || message,
              null,
              2
            )}
          </JsonContent>
        ) : (
          <MarkdownRenderer content={content} />
        )}
      </MessageContent>
    </MessageBlock>
  );
};

function extractContent(message: Message): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  
  if (Array.isArray(message.content)) {
    // Handle array of content blocks
    return message.content
      .map((block: any) => {
        if (typeof block === 'string') {
          return block;
        } else if (block.text) {
          return block.text;
        } else if (block.type === 'text' && block.content) {
          return block.content;
        }
        return '';
      })
      .filter(Boolean)
      .join('');
  }
  
  return JSON.stringify(message.content, null, 2);
}