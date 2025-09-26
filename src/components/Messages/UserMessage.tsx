import React, { useState } from "react";
import styled from "@emotion/styled";
import { UIMessage } from "../../types/claude";
import { MessageWindow, ButtonConfig } from "./MessageWindow";

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
  message: UIMessage;
  className?: string;
}

export const UserMessage: React.FC<UserMessageProps> = ({ message, className }) => {
  const [copied, setCopied] = useState(false);

  const content =
    typeof message.content === "string"
      ? message.content
      : JSON.stringify(message.content, null, 2);

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
