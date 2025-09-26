import React, { useState } from "react";
import styled from "@emotion/styled";
import { UIMessage } from "../../types/claude";

const ResultContainer = styled.div<{ isError?: boolean }>`
  margin: 8px 0;
  padding: 8px 10px;
  background: ${(props) => (props.isError ? "rgba(244, 135, 113, 0.05)" : "rgba(0, 0, 0, 0.2)")};
  border-left: 2px solid
    ${(props) => (props.isError ? "rgba(244, 135, 113, 0.3)" : "rgba(255, 255, 255, 0.1)")};
  border-radius: 2px;
  font-size: 11px;
  color: #d4d4d4;
`;

const CommandHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  color: #969696;
  font-size: 10px;
  cursor: pointer;

  &:hover {
    color: #b0b0b0;
  }
`;

const CommandIcon = styled.span`
  font-size: 12px;
  opacity: 0.7;
`;

const CommandText = styled.span`
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  color: #4ec9b0;
`;

const ResultOutput = styled.pre<{ isError?: boolean }>`
  margin: 0;
  padding: 8px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 2px;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 11px;
  line-height: 1.4;
  color: ${(props) => (props.isError ? "#f48771" : "#d4d4d4")};
  overflow-x: auto;
  max-height: 300px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
`;

const JsonDetails = styled.pre`
  margin: 8px 0 0 0;
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

interface BashResultMessageProps {
  message: UIMessage;
  className?: string;
}

export const BashResultMessage: React.FC<BashResultMessageProps> = ({ message, className }) => {
  const [showJson, setShowJson] = useState(false);

  const isError = message.toolResult?.is_error || false;
  const output = message.toolResult?.content || message.content || "";
  const command = message.associatedToolUse?.input?.command || "bash";
  const description = message.associatedToolUse?.input?.description;

  return (
    <div className={className}>
      <ResultContainer isError={isError}>
        <CommandHeader onClick={() => setShowJson(!showJson)}>
          <CommandIcon>›</CommandIcon>
          <CommandText>
            {command}
            {description && (
              <span style={{ color: "#808080", marginLeft: "8px" }}># {description}</span>
            )}
          </CommandText>
        </CommandHeader>

        <ResultOutput isError={isError}>{output}</ResultOutput>

        {showJson && (
          <JsonDetails>
            {JSON.stringify(
              {
                toolUseId: message.toolUseId,
                command: message.associatedToolUse?.input,
                result: message.toolResult,
                metadata: message.metadata,
              },
              null,
              2
            )}
          </JsonDetails>
        )}
      </ResultContainer>
    </div>
  );
};
