import React from "react";
import type { DisplayedMessageWithErrorCount } from "@/utils/messages/messageUtils";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { ToolMessage } from "./ToolMessage";
import { ReasoningMessage } from "./ReasoningMessage";
import { StreamErrorMessage } from "./StreamErrorMessage";
import { HistoryHiddenMessage } from "./HistoryHiddenMessage";

interface MessageRendererProps {
  message: DisplayedMessageWithErrorCount;
  className?: string;
  onEditUserMessage?: (messageId: string, content: string) => void;
  workspaceId?: string;
  model?: string;
}

// Memoized to prevent unnecessary re-renders when parent (AIView) updates
export const MessageRenderer = React.memo<MessageRendererProps>(
  ({ message, className, onEditUserMessage, workspaceId, model }) => {
    // Route based on message type
    switch (message.type) {
      case "user":
        return <UserMessage message={message} className={className} onEdit={onEditUserMessage} />;
      case "assistant":
        return (
          <AssistantMessage message={message} className={className} workspaceId={workspaceId} />
        );
      case "tool":
        return <ToolMessage message={message} className={className} workspaceId={workspaceId} />;
      case "reasoning":
        return <ReasoningMessage message={message} className={className} />;
      case "stream-error":
        return (
          <StreamErrorMessage
            message={message}
            className={className}
            workspaceId={workspaceId}
            model={model}
          />
        );
      case "history-hidden":
        return <HistoryHiddenMessage message={message} className={className} />;
      default:
        console.error("don't know how to render message", message);
        return null;
    }
  }
);

MessageRenderer.displayName = "MessageRenderer";
