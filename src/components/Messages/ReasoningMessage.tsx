import React, { useState, useEffect } from "react";
import styled from "@emotion/styled";
import { DisplayedMessage } from "../../types/message";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { TypewriterMarkdown } from "./TypewriterMarkdown";

const ReasoningContainer = styled.div`
  margin: 8px 0;
  padding: 2px;
  background: color-mix(in srgb, var(--color-thinking-mode) 2%, transparent);
  border-radius: 4px;
  position: relative;
`;

const ReasoningHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  cursor: pointer;
  user-select: none;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--color-thinking-mode);
  font-weight: 600;
  opacity: 0.8;
`;

const ThinkingIcon = styled.span`
  font-size: 12px;
`;

const StreamingIndicator = styled.span`
  font-style: italic;
  font-weight: normal;
  text-transform: none;
  letter-spacing: normal;
  animation: pulse 1.5s ease-in-out infinite;

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 1;
    }
  }
`;

const Caret = styled.span<{ isExpanded: boolean }>`
  color: var(--color-thinking-mode);
  opacity: 0.6;
  transition: transform 0.2s ease;
  transform: rotate(${(props) => (props.isExpanded ? "90deg" : "0deg")});
  font-size: 12px;
`;

const ReasoningContent = styled.div`
  font-family: var(--font-primary);
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-secondary);
  font-style: italic;
  opacity: 0.85;

  p {
    margin: 0 0 4px 0;
    &:last-child {
      margin-bottom: 0;
    }
  }
`;

const WaitingMessage = styled.div`
  color: var(--color-thinking-mode);
  opacity: 0.6;
`;

interface ReasoningMessageProps {
  message: DisplayedMessage & { type: "reasoning" };
  className?: string;
}

export const ReasoningMessage: React.FC<ReasoningMessageProps> = ({ message, className }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const content = message.content;
  const isStreaming = message.isStreaming;

  // Auto-collapse when streaming ends
  useEffect(() => {
    if (!isStreaming) {
      setIsExpanded(false);
    }
  }, [isStreaming]);

  const toggleExpanded = () => {
    if (!isStreaming) {
      setIsExpanded(!isExpanded);
    }
  };

  // Render appropriate content based on state
  const renderContent = () => {
    // Empty streaming state
    if (isStreaming && !content) {
      return <WaitingMessage>Thinking...</WaitingMessage>;
    }

    // Streaming text gets typewriter effect
    if (isStreaming) {
      return <TypewriterMarkdown deltas={[content]} isComplete={false} />;
    }

    // Completed text renders as static content
    return content ? <MarkdownRenderer content={content} /> : null;
  };

  return (
    <ReasoningContainer className={className}>
      <ReasoningHeader onClick={toggleExpanded}>
        <HeaderLeft>
          <ThinkingIcon>💭</ThinkingIcon>
          <span>Thinking</span>
          {isStreaming && <StreamingIndicator>streaming...</StreamingIndicator>}
        </HeaderLeft>
        {!isStreaming && <Caret isExpanded={isExpanded}>▸</Caret>}
      </ReasoningHeader>

      {isExpanded && <ReasoningContent>{renderContent()}</ReasoningContent>}
    </ReasoningContainer>
  );
};
