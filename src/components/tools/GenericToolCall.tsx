import React, { useState } from "react";
import styled from "@emotion/styled";

const ToolContainer = styled.div<{ expanded: boolean }>`
  margin: 8px 0;
  padding: ${(props) => (props.expanded ? "8px 12px" : "4px 12px")};
  background: rgba(100, 100, 100, 0.05);
  border-radius: 4px;
  font-family: var(--font-monospace);
  font-size: 11px;
  transition: all 0.2s ease;
`;

const ToolHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  color: var(--color-text-secondary);

  &:hover {
    color: var(--color-text);
  }
`;

const ExpandIcon = styled.span<{ expanded: boolean }>`
  display: inline-block;
  transition: transform 0.2s ease;
  transform: ${(props) => (props.expanded ? "rotate(90deg)" : "rotate(0deg)")};
  font-size: 10px;
`;

const ToolName = styled.span`
  font-weight: 500;
`;

const StatusIndicator = styled.span<{ status: string }>`
  font-size: 10px;
  margin-left: auto;
  opacity: 0.8;
  color: ${({ status }) => {
    switch (status) {
      case "executing":
        return "#ffa000";
      case "completed":
        return "#4caf50";
      case "failed":
        return "#f44336";
      default:
        return "#9e9e9e";
    }
  }};
`;

const ToolDetails = styled.div`
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  color: var(--color-text);
`;

const DetailSection = styled.div`
  margin: 6px 0;
`;

const DetailLabel = styled.div`
  font-size: 10px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const DetailContent = styled.pre`
  margin: 0;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
  font-size: 11px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow-y: auto;
`;

const LoadingDots = styled.span`
  &::after {
    content: "...";
    animation: dots 1.5s infinite;
  }

  @keyframes dots {
    0%,
    20% {
      content: ".";
    }
    40% {
      content: "..";
    }
    60%,
    100% {
      content: "...";
    }
  }
`;

interface GenericToolCallProps {
  toolName: string;
  args?: unknown;
  result?: unknown;
  status?: "pending" | "executing" | "completed" | "failed";
}

export const GenericToolCall: React.FC<GenericToolCallProps> = ({
  toolName,
  args,
  result,
  status = "pending",
}) => {
  const [expanded, setExpanded] = useState(false);

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return "None";
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  };

  const getStatusDisplay = () => {
    switch (status) {
      case "executing":
        return (
          <>
            <LoadingDots /> executing
          </>
        );
      case "completed":
        return "✓ completed";
      case "failed":
        return "✗ failed";
      default:
        return "pending";
    }
  };

  const hasDetails = args !== undefined || result !== undefined;

  return (
    <ToolContainer expanded={expanded}>
      <ToolHeader onClick={() => hasDetails && setExpanded(!expanded)}>
        {hasDetails && <ExpandIcon expanded={expanded}>▶</ExpandIcon>}
        <ToolName>{toolName}</ToolName>
        <StatusIndicator status={status}>{getStatusDisplay()}</StatusIndicator>
      </ToolHeader>

      {expanded && hasDetails && (
        <ToolDetails>
          {args !== undefined && (
            <DetailSection>
              <DetailLabel>Arguments</DetailLabel>
              <DetailContent>{formatValue(args)}</DetailContent>
            </DetailSection>
          )}

          {result !== undefined && (
            <DetailSection>
              <DetailLabel>Result</DetailLabel>
              <DetailContent>{formatValue(result)}</DetailContent>
            </DetailSection>
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
