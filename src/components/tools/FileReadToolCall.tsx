import React, { useState } from "react";
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
import styles from "./FileReadToolCall.module.css";

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
        <div className={styles.styledToolHeader} onClick={toggleExpanded}>
          <div className={styles.compactHeader}>
            <span className={styles.searchIcon}>🔍</span>
            <span className={styles.filePath}>{filePath}</span>
            {tokenCount !== null && <span className={styles.tokenCount}>~{tokenCount} tokens</span>}
          </div>
        </div>
      </ToolContainer>
    );
  }

  // Full display when expanded
  return (
    <ToolContainer expanded={expanded}>
      <div className={styles.styledToolHeader}>
        <div className={styles.leftContent} onClick={toggleExpanded}>
          <span className={styles.searchIcon}>🔍</span>
          <span className={styles.filePath}>{filePath}</span>
          {tokenCount !== null && <span className={styles.tokenCount}>~{tokenCount} tokens</span>}
        </div>
        {result && result.success && (
          <div className={styles.buttonGroup}>
            <HeaderButton
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                void handleCopyContent();
              }}
            >
              {copied ? "✓ Copied" : "Copy Content"}
            </HeaderButton>
          </div>
        )}
      </div>

      {expanded && (
        <ToolDetails>
          {result && (
            <>
              {result.success === false && result.error && (
                <DetailSection>
                  <DetailLabel>Error</DetailLabel>
                  <div className={styles.errorMessage}>{result.error}</div>
                </DetailSection>
              )}

              {result.success && (
                <>
                  <div className={styles.metadataRow}>
                    <span>Lines: {result.lines_read}</span>
                    <span>Size: {formatFileSize(result.file_size)}</span>
                    <span>Modified: {new Date(result.modifiedTime).toLocaleString()}</span>
                  </div>

                  <DetailSection>
                    <DetailLabel>Content</DetailLabel>
                    <pre className={styles.contentBlock}>{result.content}</pre>
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
