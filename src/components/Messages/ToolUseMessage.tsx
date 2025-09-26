import React, { useState } from "react";
import styled from "@emotion/styled";
import { Message } from "../../types/claude";

const ToolContainer = styled.div`
  margin: 6px 0;
  padding: 4px 10px;
  background: transparent;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 11px;
  color: #808080;
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 22px;
  transition: all 0.15s ease;
  opacity: 0.8;
  cursor: pointer;

  &:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.02);
  }
`;

const ToolContent = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
`;

const ToolIcon = styled.span`
  font-size: 12px;
  flex-shrink: 0;
  opacity: 0.7;
`;

const ToolName = styled.span`
  font-weight: 500;
  color: #969696;
  font-size: 10px;
`;

const ToolDescription = styled.span`
  color: #b0b0b0;
  font-weight: normal;
  margin-left: 6px;

  .command {
    font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
    color: #d4d4d4;
  }

  .comment {
    color: #808080;
    margin-left: 8px;
  }
`;

const InputDetails = styled.pre`
  margin: 4px 0 0 18px;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 10px;
  line-height: 1.4;
  color: #707070;
  background: rgba(0, 0, 0, 0.1);
  padding: 6px 8px;
  border-radius: 2px;
  border-left: 1px solid rgba(255, 255, 255, 0.05);
  overflow-x: auto;
  max-height: 150px;
  overflow-y: auto;
`;

interface ToolUseMessageProps {
  message: Message;
  className?: string;
}

export const ToolUseMessage: React.FC<ToolUseMessageProps> = ({ message, className }) => {
  const [showDetails, setShowDetails] = useState(false);

  // Extract tool information
  const toolName = message.metadata?.toolName || extractToolName(message);
  const toolInput = message.metadata?.toolInput || extractToolInput(message);

  const { icon, description } = formatToolDisplay(toolName, toolInput);

  return (
    <div className={className}>
      <ToolContainer onClick={() => toolInput && setShowDetails(!showDetails)}>
        <ToolContent>
          <ToolIcon>{icon}</ToolIcon>
          <ToolName>{toolName}:</ToolName>
          <ToolDescription>{description}</ToolDescription>
        </ToolContent>
      </ToolContainer>

      {showDetails && toolInput && (
        <InputDetails>{JSON.stringify(toolInput, null, 2)}</InputDetails>
      )}
    </div>
  );
};

// Helper functions to extract tool info from various message formats
function extractToolName(message: Message): string {
  // Check if content has tool_use blocks
  if (message.content && Array.isArray(message.content)) {
    const toolBlock = message.content.find((block: any) => block.type === "tool_use");
    if (toolBlock) return toolBlock.name;
  }

  // Check metadata (cast to any since tool_use messages come from assistant messages)
  const original = message.metadata?.originalSDKMessage as any;
  if (original?.message?.content) {
    const content = original.message.content;
    if (Array.isArray(content)) {
      const toolBlock = content.find((block: any) => block.type === "tool_use");
      if (toolBlock) return toolBlock.name;
    }
  }

  return "Unknown Tool";
}

function extractToolInput(message: Message): any {
  // Check if content has tool_use blocks
  if (message.content && Array.isArray(message.content)) {
    const toolBlock = message.content.find((block: any) => block.type === "tool_use");
    if (toolBlock) return toolBlock.input;
  }

  // Check metadata (cast to any since tool_use messages come from assistant messages)
  const original = message.metadata?.originalSDKMessage as any;
  if (original?.message?.content) {
    const content = original.message.content;
    if (Array.isArray(content)) {
      const toolBlock = content.find((block: any) => block.type === "tool_use");
      if (toolBlock) return toolBlock.input;
    }
  }

  return null;
}

function formatToolDisplay(
  toolName: string,
  toolInput: any
): { icon: string; description: React.ReactNode } {
  switch (toolName) {
    case "Bash":
      return {
        icon: "›",
        description: toolInput?.command ? (
          <span className="command">
            {toolInput.command}
            {toolInput.description && <span className="comment"># {toolInput.description}</span>}
          </span>
        ) : (
          "Running command"
        ),
      };

    case "Read":
      return {
        icon: "◉",
        description: <span>{toolInput?.file_path || "Reading file"}</span>,
      };

    case "Edit":
      return {
        icon: "✎",
        description: <span>{toolInput?.file_path || "Editing file"}</span>,
      };

    case "Write":
      return {
        icon: "✎",
        description: <span>{toolInput?.file_path || "Writing file"}</span>,
      };

    case "MultiEdit":
      return {
        icon: "✎",
        description: (
          <span>{`${toolInput?.edits?.length || 0} edits to ${toolInput?.file_path || "file"}`}</span>
        ),
      };

    case "Grep":
      return {
        icon: "◎",
        description: <span>{`Searching for: ${toolInput?.pattern || "pattern"}`}</span>,
      };

    case "Glob":
      return {
        icon: "◈",
        description: <span>{`Matching: ${toolInput?.pattern || "pattern"}`}</span>,
      };

    case "WebSearch":
      return {
        icon: "◈",
        description: <span>{toolInput?.query || "Searching web"}</span>,
      };

    case "WebFetch":
      return {
        icon: "◈",
        description: (
          <span>
            {toolInput?.url ? `Fetching: ${new URL(toolInput.url).hostname}` : "Fetching URL"}
          </span>
        ),
      };

    case "Task":
      return {
        icon: "◆",
        description: <span>{toolInput?.description || "Running agent task"}</span>,
      };

    case "TodoWrite":
      return {
        icon: "☐",
        description: <span>{`Updating todo list (${toolInput?.todos?.length || 0} items)`}</span>,
      };

    case "ExitPlanMode":
      return {
        icon: "P",
        description: <span style={{ color: "var(--color-plan-mode)" }}>Creating plan...</span>,
      };

    default:
      return {
        icon: "•",
        description: <span>Tool invocation</span>,
      };
  }
}
