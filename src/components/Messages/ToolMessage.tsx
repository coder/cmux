import React from "react";
import type { DisplayedMessage } from "../../types/message";
import { GenericToolCall } from "../tools/GenericToolCall";
import { BashToolCall } from "../tools/BashToolCall";
import type { BashToolArgs, BashToolResult } from "../../types/tools";

interface ToolMessageProps {
  message: DisplayedMessage & { type: "tool" };
  className?: string;
}

// Type guard for bash tool
function isBashTool(toolName: string, args: unknown): args is BashToolArgs {
  return (
    toolName === "bash" &&
    typeof args === "object" &&
    args !== null &&
    "script" in args &&
    "timeout_secs" in args
  );
}

export const ToolMessage: React.FC<ToolMessageProps> = ({ message, className }) => {
  // Route to specialized components based on tool name
  if (isBashTool(message.toolName, message.args)) {
    return (
      <div className={className}>
        <BashToolCall
          args={message.args}
          result={message.result as BashToolResult | undefined}
          status={message.status}
        />
      </div>
    );
  }

  // Fallback to generic tool call
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
