import React, { useState } from "react";
import styled from "@emotion/styled";
import type { DisplayedMessage } from "../../types/message";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { TypewriterMarkdown } from "./TypewriterMarkdown";
import type { ButtonConfig } from "./MessageWindow";
import { MessageWindow } from "./MessageWindow";

const RawContent = styled.pre`
  font-family: var(--font-monospace);
  font-size: 12px;
  line-height: 1.6;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
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
  message: DisplayedMessage & { type: "assistant" };
  className?: string;
}

export const AssistantMessage: React.FC<AssistantMessageProps> = ({ message, className }) => {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const content = message.content;
  const isStreaming = message.isStreaming;

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
          onClick: () => void handleCopy(),
        },
        {
          label: showRaw ? "Show Markdown" : "Show Text",
          onClick: () => setShowRaw(!showRaw),
          active: showRaw,
        },
      ];

  // Render appropriate content based on state
  const renderContent = () => {
    // Empty streaming state
    if (isStreaming && !content) {
      return <WaitingMessage>Waiting for response...</WaitingMessage>;
    }

    // Streaming text gets typewriter effect
    if (isStreaming) {
      return <TypewriterMarkdown deltas={[content]} isComplete={false} />;
    }

    // Completed text renders as static content
    return content ? (
      showRaw ? (
        <RawContent>{content}</RawContent>
      ) : (
        <MarkdownRenderer content={content} />
      )
    ) : null;
  };

  // Create label with model name if available
  const renderLabel = () => {
    const modelName = message.model;
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
      className={className}
    >
      {renderContent()}
    </MessageWindow>
  );
};
