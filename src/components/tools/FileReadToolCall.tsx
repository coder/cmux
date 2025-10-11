import React from "react";
import styled from "@emotion/styled";
import type { FileReadToolArgs, FileReadToolResult } from "@/types/tools";
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

const FileInfoRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
  font-size: 11px;
  line-height: 1.4;
`;

const InfoItem = styled.div`
  display: flex;
  gap: 6px;
`;

const InfoLabel = styled.span`
  color: var(--color-text-secondary);
  font-weight: 500;
`;

const InfoValue = styled.span`
  color: var(--color-text);
  font-family: var(--font-monospace);
  word-break: break-all;
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

/**
 * Parse file_read content which comes formatted as:
 * LINE_NUMBER\tCONTENT
 * LINE_NUMBER\tCONTENT
 * ...
 */
function parseFileContent(content: string): {
  lineNumbers: string[];
  actualContent: string;
  actualBytes: number;
} {
  const lines = content.split("\n");
  const lineNumbers: string[] = [];
  const contentLines: string[] = [];

  for (const line of lines) {
    const tabIndex = line.indexOf("\t");
    if (tabIndex !== -1) {
      // Line has format: NUMBER\tCONTENT
      lineNumbers.push(line.substring(0, tabIndex));
      contentLines.push(line.substring(tabIndex + 1));
    } else {
      // Malformed or empty line - preserve as-is
      lineNumbers.push("");
      contentLines.push(line);
    }
  }

  const actualContent = contentLines.join("\n");
  // Calculate actual bytes (content + newlines, without line number prefixes)
  const actualBytes = new TextEncoder().encode(actualContent).length;

  return { lineNumbers, actualContent, actualBytes };
}

export const FileReadToolCall: React.FC<FileReadToolCallProps> = ({
  args,
  result,
  status = "pending",
}) => {
  const { expanded, toggleExpanded } = useToolExpansion();

  // Use full file path for consistency with file_edit display
  const filePath = args.filePath;

  // Parse the file content to extract line numbers and actual content
  const parsedContent = result?.success && result.content ? parseFileContent(result.content) : null;

  return (
    <ToolContainer expanded={expanded}>
      <ToolHeader onClick={toggleExpanded}>
        <ExpandIcon expanded={expanded}>▶</ExpandIcon>
        <TooltipWrapper inline>
          <span>📖</span>
          <Tooltip>file_read</Tooltip>
        </TooltipWrapper>
        <FilePathText>{filePath}</FilePathText>
        {result && result.success && parsedContent && (
          <MetadataText>
            read {formatBytes(parsedContent.actualBytes)} of {formatBytes(result.file_size)}
          </MetadataText>
        )}
        <StatusIndicator status={status}>{getStatusDisplay(status)}</StatusIndicator>
      </ToolHeader>

      {expanded && (
        <ToolDetails>
          <DetailSection>
            <FileInfoRow>
              <InfoItem>
                <InfoLabel>Path:</InfoLabel>
                <InfoValue>{args.filePath}</InfoValue>
              </InfoItem>
              {args.offset !== undefined && (
                <InfoItem>
                  <InfoLabel>Offset:</InfoLabel>
                  <InfoValue>line {args.offset}</InfoValue>
                </InfoItem>
              )}
              {args.limit !== undefined && (
                <InfoItem>
                  <InfoLabel>Limit:</InfoLabel>
                  <InfoValue>{args.limit} lines</InfoValue>
                </InfoItem>
              )}
            </FileInfoRow>
          </DetailSection>

          {result && (
            <>
              {result.success === false && result.error && (
                <DetailSection>
                  <DetailLabel>Error</DetailLabel>
                  <ErrorMessage>{result.error}</ErrorMessage>
                </DetailSection>
              )}

              {result.success && result.content && parsedContent && (
                <DetailSection>
                  <DetailLabel>Content</DetailLabel>
                  <ContentBlock>
                    <LineNumbers>
                      {parsedContent.lineNumbers.map((lineNum, i) => (
                        <div key={i}>{lineNum}</div>
                      ))}
                    </LineNumbers>
                    <ContentText>{parsedContent.actualContent}</ContentText>
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
