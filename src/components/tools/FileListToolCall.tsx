import React from "react";
import styled from "@emotion/styled";
import type { FileListToolArgs, FileListToolResult, FileEntry } from "@/types/tools";
import {
  ToolContainer,
  ToolHeader,
  ExpandIcon,
  StatusIndicator,
  ToolDetails,
  DetailSection,
  DetailLabel,
  LoadingDots,
} from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay } from "./shared/toolUtils";

// FileList-specific styled components

const PathText = styled.span`
  color: var(--color-text);
  font-family: var(--font-monospace);
  font-weight: 500;
`;

const ParamsText = styled.span`
  color: var(--color-text-secondary);
  font-size: 10px;
  margin-left: 8px;
`;

const CountBadge = styled.span`
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
  line-height: 1.5;
  white-space: pre-wrap;
`;

const ErrorHint = styled.div`
  color: var(--color-text-secondary);
  font-size: 10px;
  margin-top: 6px;
  font-style: italic;
`;

const OutputBlock = styled.pre`
  margin: 0;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
  font-size: 11px;
  line-height: 1.6;
  white-space: pre;
  overflow-x: auto;
  font-family: var(--font-monospace);
  color: var(--color-text);
`;

const EmptyMessage = styled.div`
  color: var(--color-text-secondary);
  font-style: italic;
  text-align: center;
  padding: 16px;
`;

interface FileListToolCallProps {
  args: FileListToolArgs;
  result?: FileListToolResult;
  status: "pending" | "streaming" | "complete" | "error";
}

export const FileListToolCall: React.FC<FileListToolCallProps> = ({ args, result, status }) => {
  const { expanded, toggleExpanded } = useToolExpansion(false);
  const isError = status === "error" || (result && !result.success);
  const isComplete = status === "complete";
  const isPending = status === "pending" || status === "streaming";

  // Build parameter summary
  const params: string[] = [];
  if (args.max_depth !== undefined && args.max_depth !== 1) {
    params.push(`depth: ${args.max_depth}`);
  }
  if (args.pattern) {
    params.push(`pattern: ${args.pattern}`);
  }
  if (args.gitignore === false) {
    params.push("gitignore: off");
  }
  if (args.max_entries) {
    params.push(`max: ${args.max_entries}`);
  }

  const paramStr = params.length > 0 ? `(${params.join(", ")})` : "";

  // Convert our status to shared ToolStatus type
  const toolStatus = isError ? "failed" : isPending ? "executing" : "completed";

  return (
    <ToolContainer expanded={expanded}>
      <ToolHeader onClick={toggleExpanded}>
        <ExpandIcon expanded={expanded}>▶</ExpandIcon>
        <span>📋 file_list</span>
        <PathText>{args.path}</PathText>
        {paramStr && <ParamsText>{paramStr}</ParamsText>}
        {isComplete && result && result.success && (
          <CountBadge>{result.total_count} entries</CountBadge>
        )}
        <StatusIndicator status={toolStatus}>{getStatusDisplay(toolStatus)}</StatusIndicator>
      </ToolHeader>

      {expanded && (
        <ToolDetails>
          {/* Pending state */}
          {isPending && (
            <DetailSection>
              Listing directory
              <LoadingDots />
            </DetailSection>
          )}

          {/* Error state */}
          {isError && result && !result.success && (
            <DetailSection>
              <DetailLabel>Error</DetailLabel>
              <ErrorMessage>
                {result.error}
                {result.total_found !== undefined && (
                  <ErrorHint>
                    Found {result.total_found}+ entries (limit: {result.limit_requested})
                  </ErrorHint>
                )}
              </ErrorMessage>
            </DetailSection>
          )}

          {/* Success state */}
          {isComplete && result && result.success && (
            <DetailSection>
              <DetailLabel>Contents ({result.total_count} entries)</DetailLabel>
              {result.output === "(empty directory)" ? (
                <EmptyMessage>Empty directory</EmptyMessage>
              ) : (
                <OutputBlock>{result.output}</OutputBlock>
              )}
            </DetailSection>
          )}
        </ToolDetails>
      )}
    </ToolContainer>
  );
};
