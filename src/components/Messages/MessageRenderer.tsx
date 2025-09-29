import React from "react";
import { CmuxMessage } from "../../types/message";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";

interface MessageRendererProps {
  message: CmuxMessage;
  className?: string;
}

export const MessageRenderer: React.FC<MessageRendererProps> = ({ message, className }) => {
  // Route based on role
  switch (message.role) {
    case "user":
      return <UserMessage message={message} className={className} />;
    case "assistant":
      return <AssistantMessage message={message} className={className} />;
    default:
      console.error("don't know how to render message", message);
      return null;
  }
};
