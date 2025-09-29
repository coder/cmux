import React from "react";
import { DisplayedMessage } from "../../types/message";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { ToolMessage } from "./ToolMessage";

interface MessageRendererProps {
  message: DisplayedMessage;
  className?: string;
}

export const MessageRenderer: React.FC<MessageRendererProps> = ({ message, className }) => {
  // Route based on message type
  switch (message.type) {
    case "user":
      return <UserMessage message={message} className={className} />;
    case "assistant":
      return <AssistantMessage message={message} className={className} />;
    case "tool":
      return <ToolMessage message={message} className={className} />;
    default:
      console.error("don't know how to render message", message);
      return null;
  }
};
