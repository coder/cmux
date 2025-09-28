import React from "react";
import { CmuxMessage } from "../../types/message";
import { isStreamingMessage } from "../../utils/messageUtils";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { StreamingAssistantMessage } from "./StreamingAssistantMessage";

interface MessageRendererProps {
  message: CmuxMessage;
  className?: string;
}

export const MessageRenderer: React.FC<MessageRendererProps> = ({ message, className }) => {
  // Check if message is streaming
  const isStreaming = isStreamingMessage(message);

  // Handle streaming messages
  if (isStreaming) {
    return <StreamingAssistantMessage message={message} className={className} />;
  }

  // Route based on role
  switch (message.role) {
    case "user":
      return <UserMessage message={message} className={className} />;
    case "assistant":
      return <AssistantMessage message={message} className={className} />;
  }
  console.error("don't know how to render message", message);
  return null;
};
