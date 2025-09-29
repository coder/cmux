import React, { useState } from "react";
import styled from "@emotion/styled";
import { CmuxMessage } from "../../types/message";
import { extractTextContent, isStreamingMessage } from "../../utils/messageUtils";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { TypewriterMarkdown } from "./TypewriterMarkdown";
import { MessageWindow, ButtonConfig } from "./MessageWindow";

const RawContent = styled.pre`
  font-family: var(--font-monospace);
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
`;

const StreamingIndicator = styled.span`
  font-size: 10px;
  color: var(--color-assistant-border);
  font-style: italic;
  margin-right: 8px;
  animation: pulse 1.5s ease-in-out infinite;

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
  }
`;

const WaitingMessage = styled.div`
  font-family: var(--font-primary);
  font-size: 13px;
  color: var(--color-text-secondary);
  font-style: italic;
`;

const LabelContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ModelName = styled.span`
  color: var(--color-text-secondary);
  font-weight: normal;
  text-transform: lowercase;
  font-size: 10px;
`;

interface AssistantMessageProps {
  message: CmuxMessage;
  className?: string;
}

export const AssistantMessage: React.FC<AssistantMessageProps> = ({ message, className }) => {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const content = extractTextContent(message);
  const isStreaming = isStreamingMessage(message);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Buttons only when not streaming
  const buttons: ButtonConfig[] = isStreaming
    ? []
    : [
        {
          label: copied ? "✓ Copied" : "Copy Text",
          onClick: handleCopy,
        },
        {
          label: showRaw ? "Show Markdown" : "Show Text",
          onClick: () => setShowRaw(!showRaw),
          active: showRaw,
        },
      ];

  // Streaming indicator in right label
  const rightLabel = isStreaming ? (
    <StreamingIndicator>streaming...</StreamingIndicator>
  ) : undefined;

  // Render appropriate content based on state
  const renderContent = () => {
    // Empty streaming state
    if (isStreaming && !content) {
      return <WaitingMessage>Waiting for response...</WaitingMessage>;
    }

    // Streaming with content
    if (isStreaming) {
      return <TypewriterMarkdown deltas={[content]} isComplete={false} />;
    }

    // Completed message
    return showRaw ? <RawContent>{content}</RawContent> : <MarkdownRenderer content={content} />;
  };

  // Create label with model name if available
  const renderLabel = () => {
    const modelName = message.metadata?.model;
    if (modelName) {
      return (
        <LabelContainer>
          <span>ASSISTANT</span>
          <ModelName>{modelName.toLowerCase()}</ModelName>
        </LabelContainer>
      );
    }
    return "ASSISTANT";
  };

  return (
    <MessageWindow
      label={renderLabel()}
      borderColor="var(--color-assistant-border)"
      message={message}
      buttons={buttons}
      rightLabel={rightLabel}
      className={className}
    >
      {renderContent()}
    </MessageWindow>
  );
};
