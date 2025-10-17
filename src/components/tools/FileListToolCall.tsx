import React from "react";
import styled from "@emotion/styled";
import type { FileListToolArgs, FileListToolResult, FileEntry } from "@/types/tools";
import { formatSize } from "@/services/tools/fileCommon";
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

const TreeContainer = styled.div`
  margin-top: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
  padding: 12px;
  overflow-x: auto;
  font-family: var(--font-monospace);
  line-height: 1.6;
`;

const Entry = styled.div`
  display: flex;
  align-items: center;
  white-space: nowrap;
  font-size: 11px;
`;

const Prefix = styled.span`
  color: var(--color-text-secondary);
  user-select: none;
`;

const Icon = styled.span`
  margin-right: 6px;
  user-select: none;
`;

const Name = styled.span`
  color: var(--color-text);
  font-weight: 500;
`;

const Size = styled.span`
  color: var(--color-text-secondary);
  margin-left: 8px;
  font-size: 10px;
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

/**
 * Recursively render a file tree with indentation
 */
function renderFileTree(entries: FileEntry[], depth: number = 0): JSX.Element[] {
  const elements: JSX.Element[] = [];

  entries.forEach((entry, index) => {
    const isLast = index === entries.length - 1;
    const prefix = depth === 0 ? "" : "│  ".repeat(depth - 1) + (isLast ? "└─ " : "├─ ");

    const icon = entry.type === "directory" ? "📁" : entry.type === "file" ? "📄" : "🔗";
    const suffix = entry.type === "directory" ? "/" : "";
    const sizeInfo = entry.size !== undefined ? ` (${formatSize(entry.size)})` : "";

    elements.push(
      <Entry key={`${depth}-${index}-${entry.name}`}>
        <Prefix>{prefix}</Prefix>
        <Icon>{icon}</Icon>
        <Name>
          {entry.name}
          {suffix}
        </Name>
        {sizeInfo && <Size>{sizeInfo}</Size>}
      </Entry>
    );

    // Recursively render children if present
    if (entry.children && entry.children.length > 0) {
      elements.push(...renderFileTree(entry.children, depth + 1));
    }
  });

  return elements;
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
              <TreeContainer>
                {result.entries.length === 0 ? (
                  <EmptyMessage>Empty directory</EmptyMessage>
                ) : (
                  <>{renderFileTree(result.entries)}</>
                )}
              </TreeContainer>
            </DetailSection>
          )}
        </ToolDetails>
      )}
    </ToolContainer>
  );
};
