import React from "react";
import styled from "@emotion/styled";
import { CmuxMessage } from "../../types/message";
import { extractTextContent } from "../../utils/messageUtils";
import { TypewriterMarkdown } from "./TypewriterMarkdown";
import { MessageWindow } from "./MessageWindow";

const StreamingIndicator = styled.span`
  font-size: 10px;
  color: var(--color-plan-mode);
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
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  color: var(--color-text-secondary);
  font-style: italic;
`;

interface StreamingAssistantMessageProps {
  message: CmuxMessage;
  className?: string;
}

export const StreamingAssistantMessage: React.FC<StreamingAssistantMessageProps> = ({
  message,
  className,
}) => {
  const content = extractTextContent(message);

  const hasDeltas = content && content.length > 0;

  return (
    <MessageWindow
      label="ASSISTANT"
      borderColor="var(--color-assistant-border)"
      message={message}
      buttons={[]}
      className={className}
      rightLabel={<StreamingIndicator>streaming...</StreamingIndicator>}
    >
      {hasDeltas ? (
        <TypewriterMarkdown deltas={[content]} isComplete={false} />
      ) : (
        <WaitingMessage>Waiting for response...</WaitingMessage>
      )}
    </MessageWindow>
  );
};
