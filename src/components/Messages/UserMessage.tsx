import React, { useState } from "react";
import styled from "@emotion/styled";
import { CmuxMessage } from "../../types/message";
import { extractTextContent } from "../../utils/messageUtils";
import { MessageWindow, ButtonConfig } from "./MessageWindow";
import { TerminalOutput } from "./TerminalOutput";

const FormattedContent = styled.pre`
  margin: 0;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: #999999;
  opacity: 0.9;
`;

interface UserMessageProps {
  message: CmuxMessage;
  className?: string;
}

export const UserMessage: React.FC<UserMessageProps> = ({ message, className }) => {
  const [copied, setCopied] = useState(false);

  const content = extractTextContent(message);

  // Check if this is a local command output
  const isLocalCommandOutput =
    content.startsWith("<local-command-stdout>") && content.endsWith("</local-command-stdout>");

  // Extract the actual output if it's a local command
  const extractedOutput = isLocalCommandOutput
    ? content.slice("<local-command-stdout>".length, -"</local-command-stdout>".length).trim()
    : "";

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
  ];

  // If it's a local command output, render with TerminalOutput
  if (isLocalCommandOutput) {
    return (
      <MessageWindow
        label="USER"
        borderColor="var(--color-user-border)"
        message={message}
        buttons={buttons}
        className={className}
      >
        <TerminalOutput output={extractedOutput} isError={false} />
      </MessageWindow>
    );
  }

  // Otherwise, render as normal user message
  return (
    <MessageWindow
      label="USER"
      borderColor="var(--color-user-border)"
      message={message}
      buttons={buttons}
      className={className}
    >
      <FormattedContent>{content}</FormattedContent>
    </MessageWindow>
  );
};
