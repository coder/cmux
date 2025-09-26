import React, { useState } from "react";
import styled from "@emotion/styled";
import { UIMessage } from "../../types/claude";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { MessageWindow, ButtonConfig } from "./MessageWindow";
import { getModeConfig } from "../../constants/permissionModes";

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
  message: UIMessage;
  className?: string;
}

export const AssistantMessage: React.FC<AssistantMessageProps> = ({ message, className }) => {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);

  const content = extractContent(message);

  // Get permission mode from message metadata
  const permissionMode = message.metadata.cmuxMeta.permissionMode;
  const modeConfig = getModeConfig(permissionMode);

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
      borderColor={modeConfig.borderColor}
      message={message}
      buttons={buttons}
      className={className}
    >
      {showRaw ? <RawContent>{content}</RawContent> : <MarkdownRenderer content={content} />}
    </MessageWindow>
  );
};

function extractContent(message: UIMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    // Handle array of content blocks
    return message.content
      .map((block: any) => {
        if (typeof block === "string") {
          return block;
        } else if (block.text) {
          return block.text;
        } else if (block.type === "text" && block.content) {
          return block.content;
        }
        return "";
      })
      .filter(Boolean)
      .join("");
  }

  return JSON.stringify(message.content, null, 2);
}
