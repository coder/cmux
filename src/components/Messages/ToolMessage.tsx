import React from "react";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";
import type { DisplayedMessage } from "@/types/message";
import { GenericToolCall } from "../tools/GenericToolCall";
import { BashToolCall } from "../tools/BashToolCall";
import { FileEditToolCall } from "../tools/FileEditToolCall";
import { FileReadToolCall } from "../tools/FileReadToolCall";
import { ProposePlanToolCall } from "../tools/ProposePlanToolCall";
import type {
  BashToolArgs,
  BashToolResult,
  FileReadToolArgs,
  FileReadToolResult,
  FileEditInsertToolArgs,
  FileEditInsertToolResult,
  FileEditReplaceStringToolArgs,
  FileEditReplaceStringToolResult,
  FileEditReplaceLinesToolArgs,
  FileEditReplaceLinesToolResult,
  ProposePlanToolArgs,
  ProposePlanToolResult,
} from "@/types/tools";

interface ToolMessageProps {
  message: DisplayedMessage & { type: "tool" };
  className?: string;
  workspaceId?: string;
}

// Type guards using Zod schemas for single source of truth
// This ensures type guards stay in sync with tool definitions
function isBashTool(toolName: string, args: unknown): args is BashToolArgs {
  if (toolName !== "bash") return false;
  return TOOL_DEFINITIONS.bash.schema.safeParse(args).success;
}

function isFileReadTool(toolName: string, args: unknown): args is FileReadToolArgs {
  if (toolName !== "file_read") return false;
  return TOOL_DEFINITIONS.file_read.schema.safeParse(args).success;
}

function isFileEditReplaceStringTool(
  toolName: string,
  args: unknown
): args is FileEditReplaceStringToolArgs {
  if (toolName !== "file_edit_replace_string") return false;
  return TOOL_DEFINITIONS.file_edit_replace_string.schema.safeParse(args).success;
}

function isFileEditReplaceLinesTool(
  toolName: string,
  args: unknown
): args is FileEditReplaceLinesToolArgs {
  if (toolName !== "file_edit_replace_lines") return false;
  return TOOL_DEFINITIONS.file_edit_replace_lines.schema.safeParse(args).success;
}

function isFileEditInsertTool(toolName: string, args: unknown): args is FileEditInsertToolArgs {
  if (toolName !== "file_edit_insert") return false;
  return TOOL_DEFINITIONS.file_edit_insert.schema.safeParse(args).success;
}

function isProposePlanTool(toolName: string, args: unknown): args is ProposePlanToolArgs {
  if (toolName !== "propose_plan") return false;
  return TOOL_DEFINITIONS.propose_plan.schema.safeParse(args).success;
}

export const ToolMessage: React.FC<ToolMessageProps> = ({ message, className, workspaceId }) => {
  // Route to specialized components based on tool name
  if (isBashTool(message.toolName, message.args)) {
    return (
      <div className={className}>
        <BashToolCall
          args={message.args}
          result={message.result as BashToolResult | undefined}
          status={message.status}
          startedAt={message.timestamp}
        />
      </div>
    );
  }

  if (isFileReadTool(message.toolName, message.args)) {
    return (
      <div className={className}>
        <FileReadToolCall
          args={message.args}
          result={message.result as FileReadToolResult | undefined}
          status={message.status}
        />
      </div>
    );
  }

  if (isFileEditReplaceStringTool(message.toolName, message.args)) {
    return (
      <div className={className}>
        <FileEditToolCall
          toolName="file_edit_replace_string"
          args={message.args}
          result={message.result as FileEditReplaceStringToolResult | undefined}
          status={message.status}
        />
      </div>
    );
  }

  if (isFileEditReplaceLinesTool(message.toolName, message.args)) {
    return (
      <div className={className}>
        <FileEditToolCall
          toolName="file_edit_replace_lines"
          args={message.args}
          result={message.result as FileEditReplaceLinesToolResult | undefined}
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

  if (isProposePlanTool(message.toolName, message.args)) {
    return (
      <div className={className}>
        <ProposePlanToolCall
          args={message.args}
          result={message.result as ProposePlanToolResult | undefined}
          status={message.status}
          workspaceId={workspaceId}
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
