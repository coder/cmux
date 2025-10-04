import React from "react";
import type { DisplayedMessage } from "../../types/message";
import { GenericToolCall } from "../tools/GenericToolCall";
import { BashToolCall } from "../tools/BashToolCall";
import { FileEditToolCall } from "../tools/FileEditToolCall";
import type {
  BashToolArgs,
  BashToolResult,
  FileEditReplaceToolArgs,
  FileEditInsertToolArgs,
  FileEditReplaceToolResult,
  FileEditInsertToolResult,
} from "../../types/tools";

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

// Type guard for file_edit_replace tool
function isFileEditReplaceTool(toolName: string, args: unknown): args is FileEditReplaceToolArgs {
  return (
    toolName === "file_edit_replace" &&
    typeof args === "object" &&
    args !== null &&
    "file_path" in args &&
    "edits" in args &&
    "lease" in args
  );
}

// Type guard for file_edit_insert tool
function isFileEditInsertTool(toolName: string, args: unknown): args is FileEditInsertToolArgs {
  return (
    toolName === "file_edit_insert" &&
    typeof args === "object" &&
    args !== null &&
    "file_path" in args &&
    "line_offset" in args &&
    "content" in args &&
    "lease" in args
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

  if (isFileEditReplaceTool(message.toolName, message.args)) {
    return (
      <div className={className}>
        <FileEditToolCall
          toolName="file_edit_replace"
          args={message.args}
          result={message.result as FileEditReplaceToolResult | undefined}
          status={message.status}
        />
      </div>
    );
  }

  if (isFileEditInsertTool(message.toolName, message.args)) {
    return (
      <div className={className}>
        <FileEditToolCall
          toolName="file_edit_insert"
          args={message.args}
          result={message.result as FileEditInsertToolResult | undefined}
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
