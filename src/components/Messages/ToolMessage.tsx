import React from "react";
import { DisplayedMessage } from "../../types/message";
import { GenericToolCall } from "../tools/GenericToolCall";

interface ToolMessageProps {
  message: DisplayedMessage & { type: "tool" };
  className?: string;
}

export const ToolMessage: React.FC<ToolMessageProps> = ({ message, className }) => {
  // Future: Add routing logic here based on toolName
  // For now, always use GenericToolCall as the fallback

  return (
    <div className={className}>
      <GenericToolCall
        toolName={message.toolName}
        args={message.args}
        result={message.result}
        status={message.status}
      />
    </div>
  );
};
