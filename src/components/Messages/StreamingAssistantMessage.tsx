import React from "react";
import styled from "@emotion/styled";
import { UIMessage } from "../../types/claude";
import { TypewriterMarkdown } from "./TypewriterMarkdown";
import { MessageWindow } from "./MessageWindow";
import { getModeConfig } from "../../constants/permissionModes";
import { formatAssistantLabel } from "./assistantHelpers";

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
  message: UIMessage;
  className?: string;
}

export const StreamingAssistantMessage: React.FC<StreamingAssistantMessageProps> = ({
  message,
  className,
}) => {
  const hasDeltas = message.contentDeltas && message.contentDeltas.length > 0;

  // Get permission mode from message metadata
  const permissionMode = message.metadata.cmuxMeta.permissionMode;
  const modeConfig = getModeConfig(permissionMode);

  return (
    <MessageWindow
      label={formatAssistantLabel(message.model)}
      borderColor={modeConfig.borderColor}
      message={message}
      buttons={[]}
      className={className}
      rightLabel={<StreamingIndicator>streaming...</StreamingIndicator>}
    >
      {hasDeltas ? (
        <TypewriterMarkdown deltas={message.contentDeltas!} isComplete={false} />
      ) : (
        <WaitingMessage>Waiting for response...</WaitingMessage>
      )}
    </MessageWindow>
  );
};
