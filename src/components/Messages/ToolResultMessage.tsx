import React, { useState } from "react";
import styled from "@emotion/styled";
import { UIMessage } from "../../types/claude";

const ResultContainer = styled.div<{ isError?: boolean }>`
  margin: 6px 0;
  padding: 6px 10px;
  background: ${(props) => (props.isError ? "rgba(244, 135, 113, 0.05)" : "transparent")};
  border-left: 1px solid
    ${(props) => (props.isError ? "rgba(244, 135, 113, 0.3)" : "rgba(255, 255, 255, 0.08)")};
  font-size: 11px;
  color: #808080;
  transition: all 0.15s ease;
  opacity: 0.8;
  cursor: pointer;

  &:hover {
    opacity: 1;
    background: rgba(255, 255, 255, 0.02);
  }
`;

const ResultHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 22px;
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
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const ResultStatus = styled.span<{ isError?: boolean }>`
  color: ${(props) => (props.isError ? "#f48771" : "#b5cea8")};
  font-weight: normal;
  margin-left: 6px;
`;

const ResultContent = styled.div`
  margin-top: 4px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 2px;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 10px;
  line-height: 1.4;
  color: #d4d4d4;
  max-height: 200px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
`;

const JsonDetails = styled.pre`
  margin: 4px 0 0 0;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 10px;
  line-height: 1.4;
  color: #707070;
  background: rgba(0, 0, 0, 0.1);
  padding: 6px 8px;
  border-radius: 2px;
  overflow-x: auto;
  max-height: 150px;
  overflow-y: auto;
`;

interface ToolResultMessageProps {
  message: UIMessage;
  className?: string;
}

export const ToolResultMessage: React.FC<ToolResultMessageProps> = ({ message, className }) => {
  const [showDetails, setShowDetails] = useState(false);

  const isError = message.toolResult?.is_error || false;
  const content = message.toolResult?.content || message.content || "";
  const toolName = message.associatedToolUse?.name || "Tool";

  // Get icon based on tool name
  const getIcon = (name: string): string => {
    switch (name) {
      case "Read":
        return "◉";
      case "Edit":
        return "✎";
      case "Write":
        return "✎";
      case "MultiEdit":
        return "✎";
      case "Grep":
        return "◎";
      case "Glob":
        return "◈";
      case "WebSearch":
        return "◈";
      case "WebFetch":
        return "◈";
      case "Task":
        return "◆";
      case "TodoWrite":
        return "☐";
      default:
        return "•";
    }
  };

  return (
    <div className={className}>
      <ResultContainer isError={isError} onClick={() => setShowDetails(!showDetails)}>
        <ResultHeader>
          <ToolIcon>{getIcon(toolName)}</ToolIcon>
          <ToolName>{toolName} Result:</ToolName>
          <ResultStatus isError={isError}>{isError ? "Error" : "Success"}</ResultStatus>
        </ResultHeader>

        {showDetails && (
          <>
            <ResultContent>
              {typeof content === "string" ? content : JSON.stringify(content, null, 2)}
            </ResultContent>

            <JsonDetails>
              {JSON.stringify(
                {
                  toolUseId: message.toolUseId,
                  toolInput: message.associatedToolUse?.input,
                  result: message.toolResult,
                  metadata: message.metadata,
                },
                null,
                2
              )}
            </JsonDetails>
          </>
        )}
      </ResultContainer>
    </div>
  );
};
