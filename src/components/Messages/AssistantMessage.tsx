import React, { useState } from "react";
import styled from "@emotion/styled";
import { CmuxMessage } from "../../types/message";
import { extractTextContent } from "../../utils/messageUtils";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { MessageWindow, ButtonConfig } from "./MessageWindow";

const RawContent = styled.pre`
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
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

interface AssistantMessageProps {
  message: CmuxMessage;
  className?: string;
}

export const AssistantMessage: React.FC<AssistantMessageProps> = ({ message, className }) => {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const content = extractTextContent(message);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const buttons: ButtonConfig[] = [
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

  return (
    <MessageWindow
      label="ASSISTANT"
      borderColor="var(--color-assistant-border)"
      message={message}
      buttons={buttons}
      className={className}
    >
      {showRaw ? <RawContent>{content}</RawContent> : <MarkdownRenderer content={content} />}
    </MessageWindow>
  );
};
