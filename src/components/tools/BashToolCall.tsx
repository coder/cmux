import React, { useState, useEffect, useRef } from "react";
import styled from "@emotion/styled";
import type { BashToolArgs, BashToolResult } from "@/types/tools";
import { BASH_DEFAULT_TIMEOUT_SECS } from "@/constants/toolLimits";
import {
  ToolContainer,
  ToolHeader,
  ExpandIcon,
  StatusIndicator,
  ToolDetails,
  DetailSection,
  DetailLabel,
  DetailContent,
  LoadingDots,
} from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay, type ToolStatus } from "./shared/toolUtils";
import { TooltipWrapper, Tooltip } from "../Tooltip";

// Bash-specific styled components

const ScriptPreview = styled.span`
  color: var(--color-text);
  font-family: var(--font-monospace);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: min(400px, 80vw);
`;

const OutputBlock = styled.pre`
  margin: 0;
  padding: 6px 8px;
  background: var(--color-code-bg);
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
  white-space: nowrap;
  flex-shrink: 0; /* Prevent shrinking in flex container */
`;

const TimeoutInfo = styled.span<{ status?: ToolStatus }>`
  color: ${({ status }) => {
    switch (status) {
      case "executing":
      case "pending":
        return "var(--color-pending)";
      default:
        return "var(--color-text-secondary)";
    }
  }};
  font-size: 10px;
  margin-left: 8px;
  white-space: nowrap;

  /* Hide on narrow containers */
  @container (max-width: 500px) {
    display: none;
  }
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
  startedAt?: number;
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${Math.round(ms / 1000)}s`;
}

export const BashToolCall: React.FC<BashToolCallProps> = ({
  args,
  result,
  status = "pending",
  startedAt,
}) => {
  const { expanded, toggleExpanded } = useToolExpansion();
  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number>(startedAt ?? Date.now());

  // Track elapsed time for pending/executing status
  useEffect(() => {
    if (status === "executing" || status === "pending") {
      const baseStart = startedAt ?? Date.now();
      startTimeRef.current = baseStart;
      setElapsedTime(Date.now() - baseStart);

      const timer = setInterval(() => {
        setElapsedTime(Date.now() - startTimeRef.current);
      }, 1000);

      return () => clearInterval(timer);
    }

    setElapsedTime(0);
    return undefined;
  }, [status, startedAt]);

  const isPending = status === "executing" || status === "pending";

  return (
    <ToolContainer expanded={expanded}>
      <ToolHeader onClick={toggleExpanded}>
        <ExpandIcon expanded={expanded}>▶</ExpandIcon>
        <TooltipWrapper inline>
          <span>🔧</span>
          <Tooltip>bash</Tooltip>
        </TooltipWrapper>
        <ScriptPreview>{args.script}</ScriptPreview>
        <TimeoutInfo status={isPending ? status : undefined}>
          timeout: {args.timeout_secs ?? BASH_DEFAULT_TIMEOUT_SECS}s
          {result && ` • took ${formatDuration(result.wall_duration_ms)}`}
          {!result && isPending && elapsedTime > 0 && ` • ${formatDuration(elapsedTime)}`}
        </TimeoutInfo>
        {result && <ExitCodeBadge exitCode={result.exitCode}>{result.exitCode}</ExitCodeBadge>}
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
