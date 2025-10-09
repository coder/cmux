import React from "react";
import styled from "@emotion/styled";
import type { FileReadToolArgs, FileReadToolResult } from "@/types/tools";
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

// FileRead-specific styled components

const FilePathText = styled.span`
  color: var(--color-text);
  font-family: var(--font-monospace);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 400px;
`;

const MetadataText = styled.span`
  color: var(--color-text-secondary);
  font-size: 10px;
  margin-left: 8px;
`;

const ContentBlock = styled.div`
  margin: 0;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
  border-left: 2px solid #2196f3;
  font-size: 11px;
  line-height: 1.4;
  max-height: 200px;
  overflow-y: auto;
  display: flex;
`;

const LineNumbers = styled.div`
  color: var(--color-text-secondary);
  opacity: 0.4;
  padding-right: 12px;
  margin-right: 8px;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
  user-select: none;
  text-align: right;
  min-width: 40px;
  font-family: var(--font-monospace);
`;

const ContentText = styled.pre`
  margin: 0;
  padding: 0;
  white-space: pre-wrap;
  word-break: break-word;
  flex: 1;
  font-family: var(--font-monospace);
`;

const ErrorMessage = styled.div`
  color: #f44336;
  font-size: 11px;
  padding: 6px 8px;
  background: rgba(244, 67, 54, 0.1);
  border-radius: 3px;
  border-left: 2px solid #f44336;
`;

interface FileReadToolCallProps {
  args: FileReadToolArgs;
  result?: FileReadToolResult;
  status?: ToolStatus;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export const FileReadToolCall: React.FC<FileReadToolCallProps> = ({
  args,
  result,
  status = "pending",
}) => {
  const { expanded, toggleExpanded } = useToolExpansion();

  // Extract just the filename from the path for compact display
  const fileName = args.filePath.split("/").pop() ?? args.filePath;

  return (
    <ToolContainer expanded={expanded}>
      <ToolHeader onClick={toggleExpanded}>
        <ExpandIcon expanded={expanded}>▶</ExpandIcon>
        <span>📖</span>
        <ToolName>file_read</ToolName>
        <FilePathText>{fileName}</FilePathText>
        {result && result.success && (
          <MetadataText>
            read {formatBytes(result.content.length)} of {formatBytes(result.file_size)}
          </MetadataText>
        )}
        <StatusIndicator status={status}>{getStatusDisplay(status)}</StatusIndicator>
      </ToolHeader>

      {expanded && (
        <ToolDetails>
          <DetailSection>
            <DetailLabel>File Path</DetailLabel>
            <DetailContent>{args.filePath}</DetailContent>
          </DetailSection>

          {args.offset !== undefined && (
            <DetailSection>
              <DetailLabel>Offset</DetailLabel>
              <DetailContent>Line {args.offset}</DetailContent>
            </DetailSection>
          )}

          {args.limit !== undefined && (
            <DetailSection>
              <DetailLabel>Limit</DetailLabel>
              <DetailContent>{args.limit} lines</DetailContent>
            </DetailSection>
          )}

          {result && (
            <>
              {result.success === false && result.error && (
                <DetailSection>
                  <DetailLabel>Error</DetailLabel>
                  <ErrorMessage>{result.error}</ErrorMessage>
                </DetailSection>
              )}

              {result.success && result.content && (
                <DetailSection>
                  <DetailLabel>Content</DetailLabel>
                  <ContentBlock>
                    <LineNumbers>
                      {result.content.split("\n").map((_, i) => (
                        <div key={i}>{(args.offset ?? 1) + i}</div>
                      ))}
                    </LineNumbers>
                    <ContentText>{result.content}</ContentText>
                  </ContentBlock>
                </DetailSection>
              )}
            </>
          )}

          {status === "executing" && !result && (
            <DetailSection>
              <DetailContent>
                Reading file
                <LoadingDots />
              </DetailContent>
            </DetailSection>
          )}
        </ToolDetails>
      )}
    </ToolContainer>
  );
};
