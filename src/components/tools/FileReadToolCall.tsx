import React, { useState } from "react";
import styled from "@emotion/styled";
import type { FileReadToolArgs, FileReadToolResult } from "@/types/tools";
import {
  ToolContainer,
  ToolHeader,
  ToolDetails,
  DetailSection,
  DetailLabel,
  DetailContent,
  LoadingDots,
  HeaderButton,
} from "./shared/ToolPrimitives";
import { useToolExpansion, type ToolStatus } from "./shared/toolUtils";

// File read specific styled components

const CompactHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  font-size: 11px;
  color: var(--color-text);
`;

const SearchIcon = styled.span`
  font-size: 14px;
`;

const FilePath = styled.span`
  font-family: var(--font-monospace);
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 400px;
`;

const TokenCount = styled.span`
  color: var(--color-text-secondary);
  font-size: 10px;
  margin-left: 4px;
`;

const ContentBlock = styled.pre`
  margin: 0;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
  border-left: 2px solid #2196f3;
  font-size: 11px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 400px;
  overflow-y: auto;
`;

const MetadataRow = styled.div`
  display: flex;
  gap: 16px;
  font-size: 10px;
  color: var(--color-text-secondary);
  padding: 4px 0;
`;

const ErrorMessage = styled.div`
  color: #f44336;
  font-size: 11px;
  padding: 6px 8px;
  background: rgba(244, 67, 54, 0.1);
  border-radius: 3px;
  border-left: 2px solid #f44336;
`;

const StyledToolHeader = styled(ToolHeader)`
  cursor: default;

  &:hover {
    color: var(--color-text-secondary);
  }
`;

const LeftContent = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  cursor: pointer;

  &:hover {
    color: var(--color-text);
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 6px;
  margin-right: 8px;
`;

interface FileReadToolCallProps {
  args: FileReadToolArgs;
  result?: FileReadToolResult;
  status?: ToolStatus;
}

// Estimate token count (rough approximation: ~4 chars per token)
function estimateTokens(content: string): number {
  return Math.ceil(content.length / 4);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export const FileReadToolCall: React.FC<FileReadToolCallProps> = ({
  args,
  result,
  status = "pending",
}) => {
  const { expanded, toggleExpanded } = useToolExpansion(false);
  const [copied, setCopied] = useState(false);

  const filePath = args.filePath;
  const tokenCount = result?.success ? estimateTokens(result.content) : null;

  const handleCopyContent = async () => {
    if (result?.success) {
      try {
        await navigator.clipboard.writeText(result.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    }
  };

  // Compact display when collapsed
  if (!expanded) {
    return (
      <ToolContainer expanded={false}>
        <StyledToolHeader onClick={toggleExpanded}>
          <CompactHeader>
            <SearchIcon>🔍</SearchIcon>
            <FilePath>{filePath}</FilePath>
            {tokenCount !== null && <TokenCount>~{tokenCount} tokens</TokenCount>}
          </CompactHeader>
        </StyledToolHeader>
      </ToolContainer>
    );
  }

  // Full display when expanded
  return (
    <ToolContainer expanded={expanded}>
      <StyledToolHeader>
        <LeftContent onClick={toggleExpanded}>
          <SearchIcon>🔍</SearchIcon>
          <FilePath>{filePath}</FilePath>
          {tokenCount !== null && <TokenCount>~{tokenCount} tokens</TokenCount>}
        </LeftContent>
        {result && result.success && (
          <ButtonGroup>
            <HeaderButton
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                void handleCopyContent();
              }}
            >
              {copied ? "✓ Copied" : "Copy Content"}
            </HeaderButton>
          </ButtonGroup>
        )}
      </StyledToolHeader>

      {expanded && (
        <ToolDetails>
          {result && (
            <>
              {result.success === false && result.error && (
                <DetailSection>
                  <DetailLabel>Error</DetailLabel>
                  <ErrorMessage>{result.error}</ErrorMessage>
                </DetailSection>
              )}

              {result.success && (
                <>
                  <MetadataRow>
                    <span>Lines: {result.lines_read}</span>
                    <span>Size: {formatFileSize(result.file_size)}</span>
                    <span>Modified: {new Date(result.modifiedTime).toLocaleString()}</span>
                  </MetadataRow>

                  <DetailSection>
                    <DetailLabel>Content</DetailLabel>
                    <ContentBlock>{result.content}</ContentBlock>
                  </DetailSection>
                </>
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
