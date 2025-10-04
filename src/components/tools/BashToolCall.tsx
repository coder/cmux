import React from "react";
import styled from "@emotion/styled";
import type { BashToolArgs, BashToolResult } from "../../types/tools";
import {
  ToolContainer,
  ToolHeader,
  ExpandIcon,
  ToolName,
  StatusIndicator,
  ToolDetails,
  DetailSection,
  DetailLabel,
  DetailContent,
  LoadingDots,
} from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay, type ToolStatus } from "./shared/toolUtils";

// Bash-specific styled components

const ScriptPreview = styled.span`
  color: var(--color-text);
  font-family: var(--font-monospace);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 400px;
`;

const OutputBlock = styled.pre`
  margin: 0;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
  border-left: 2px solid #4caf50;
  font-size: 11px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
`;

const ExitCodeBadge = styled.span<{ exitCode: number }>`
  display: inline-block;
  padding: 2px 6px;
  background: ${(props) => (props.exitCode === 0 ? "#4caf50" : "#f44336")};
  color: white;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  margin-left: 8px;
`;

const TimeoutInfo = styled.span`
  color: var(--color-text-secondary);
  font-size: 10px;
  margin-left: 8px;
`;

const ErrorMessage = styled.div`
  color: #f44336;
  font-size: 11px;
  padding: 6px 8px;
  background: rgba(244, 67, 54, 0.1);
  border-radius: 3px;
  border-left: 2px solid #f44336;
`;

interface BashToolCallProps {
  args: BashToolArgs;
  result?: BashToolResult;
  status?: ToolStatus;
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

export const BashToolCall: React.FC<BashToolCallProps> = ({ args, result, status = "pending" }) => {
  const { expanded, toggleExpanded } = useToolExpansion();

  return (
    <ToolContainer expanded={expanded}>
      <ToolHeader onClick={toggleExpanded}>
        <ExpandIcon expanded={expanded}>▶</ExpandIcon>
        <ToolName>bash</ToolName>
        <ScriptPreview>{args.script}</ScriptPreview>
        <TimeoutInfo>
          timeout: {args.timeout_secs}s
          {result && ` • took ${formatDuration(result.wall_duration_ms)}`}
        </TimeoutInfo>
        {result && <ExitCodeBadge exitCode={result.exitCode}>exit {result.exitCode}</ExitCodeBadge>}
        <StatusIndicator status={status}>{getStatusDisplay(status)}</StatusIndicator>
      </ToolHeader>

      {expanded && (
        <ToolDetails>
          <DetailSection>
            <DetailLabel>Script</DetailLabel>
            <DetailContent>{args.script}</DetailContent>
          </DetailSection>

          {result && (
            <>
              {result.success === false && result.error && (
                <DetailSection>
                  <DetailLabel>Error</DetailLabel>
                  <ErrorMessage>{result.error}</ErrorMessage>
                </DetailSection>
              )}

              {result.output && (
                <DetailSection>
                  <DetailLabel>Output</DetailLabel>
                  <OutputBlock>{result.output}</OutputBlock>
                </DetailSection>
              )}
            </>
          )}

          {status === "executing" && !result && (
            <DetailSection>
              <DetailContent>
                Waiting for result
                <LoadingDots />
              </DetailContent>
            </DetailSection>
          )}
        </ToolDetails>
      )}
    </ToolContainer>
  );
};
