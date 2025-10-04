import React from "react";
import type { DisplayedMessage } from "../../types/message";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { ToolMessage } from "./ToolMessage";
import { ReasoningMessage } from "./ReasoningMessage";
import { StreamErrorMessage } from "./StreamErrorMessage";

interface MessageRendererProps {
  message: DisplayedMessage;
  className?: string;
  onEditUserMessage?: (messageId: string, content: string) => void;
}

export const MessageRenderer: React.FC<MessageRendererProps> = ({
  message,
  className,
  onEditUserMessage,
}) => {
  // Route based on message type
  switch (message.type) {
    case "user":
      return <UserMessage message={message} className={className} onEdit={onEditUserMessage} />;
    case "assistant":
      return <AssistantMessage message={message} className={className} />;
    case "tool":
      return <ToolMessage message={message} className={className} />;
    case "reasoning":
      return <ReasoningMessage message={message} className={className} />;
    case "stream-error":
      return <StreamErrorMessage message={message} className={className} />;
    default:
      console.error("don't know how to render message", message);
      return null;
  }
};
