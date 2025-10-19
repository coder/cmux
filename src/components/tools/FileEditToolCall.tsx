import React from "react";
import styled from "@emotion/styled";
import { parsePatch } from "diff";
import type {
  FileEditInsertToolArgs,
  FileEditInsertToolResult,
  FileEditReplaceStringToolArgs,
  FileEditReplaceStringToolResult,
  FileEditReplaceLinesToolArgs,
  FileEditReplaceLinesToolResult,
} from "@/types/tools";
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
import { useToolExpansion, getStatusDisplay, type ToolStatus } from "./shared/toolUtils";
import { TooltipWrapper, Tooltip } from "../Tooltip";
import { DiffContainer, DiffRenderer, SelectableDiffRenderer } from "../shared/DiffRenderer";
import { KebabMenu, type KebabMenuItem } from "../KebabMenu";

// File edit specific styled components

const FilePath = styled.span`
  color: var(--color-text);
  font-family: var(--font-monospace);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 400px;
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

const KebabWrapper = styled.div`
  margin-right: 8px;
`;

type FileEditOperationArgs =
  | FileEditReplaceStringToolArgs
  | FileEditReplaceLinesToolArgs
  | FileEditInsertToolArgs;

type FileEditToolResult =
  | FileEditReplaceStringToolResult
  | FileEditReplaceLinesToolResult
  | FileEditInsertToolResult;

interface FileEditToolCallProps {
  toolName: "file_edit_replace_string" | "file_edit_replace_lines" | "file_edit_insert";
  args: FileEditOperationArgs;
  result?: FileEditToolResult;
  status?: ToolStatus;
  onReviewNote?: (note: string) => void;
}

function renderDiff(
  diff: string,
  filePath?: string,
  onReviewNote?: (note: string) => void
): React.ReactNode {
  try {
    const patches = parsePatch(diff);
    if (patches.length === 0) {
      return <div style={{ padding: "8px", color: "#888" }}>No changes</div>;
    }

    // Render each hunk using SelectableDiffRenderer if we have a callback, otherwise DiffRenderer
    return patches.map((patch, patchIdx) => (
      <React.Fragment key={patchIdx}>
        {patch.hunks.map((hunk, hunkIdx) => (
          <React.Fragment key={hunkIdx}>
            {onReviewNote && filePath ? (
              <SelectableDiffRenderer
                content={hunk.lines.join("\n")}
                showLineNumbers={true}
                oldStart={hunk.oldStart}
                newStart={hunk.newStart}
                filePath={filePath}
                onReviewNote={onReviewNote}
              />
            ) : (
              <DiffRenderer
                content={hunk.lines.join("\n")}
                showLineNumbers={true}
                oldStart={hunk.oldStart}
                newStart={hunk.newStart}
                filePath={filePath}
              />
            )}
          </React.Fragment>
        ))}
      </React.Fragment>
    ));
  } catch (error) {
    return <ErrorMessage>Failed to parse diff: {String(error)}</ErrorMessage>;
  }
}

export const FileEditToolCall: React.FC<FileEditToolCallProps> = ({
  toolName,
  args,
  result,
  status = "pending",
  onReviewNote,
}) => {
  const { expanded, toggleExpanded } = useToolExpansion(true);
  const [showRaw, setShowRaw] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const filePath = "file_path" in args ? args.file_path : undefined;

  const handleCopyPatch = async () => {
    if (result && result.success && result.diff) {
      try {
        await navigator.clipboard.writeText(result.diff);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    }
  };

  // Build kebab menu items for successful edits with diffs
  const kebabMenuItems: KebabMenuItem[] =
    result && result.success && result.diff
      ? [
          {
            label: copied ? "✓ Copied" : "Copy Patch",
            onClick: () => void handleCopyPatch(),
          },
          {
            label: showRaw ? "Show Parsed" : "Show Patch",
            onClick: () => setShowRaw(!showRaw),
            active: showRaw,
          },
        ]
      : [];

  return (
    <ToolContainer expanded={expanded}>
      <StyledToolHeader>
        <LeftContent onClick={toggleExpanded}>
          <ExpandIcon expanded={expanded}>▶</ExpandIcon>
          <TooltipWrapper inline>
            <span>✏️</span>
            <Tooltip>{toolName}</Tooltip>
          </TooltipWrapper>
          <FilePath>{filePath}</FilePath>
        </LeftContent>
        {!(result && result.success && result.diff) && (
          <StatusIndicator status={status}>{getStatusDisplay(status)}</StatusIndicator>
        )}
        {kebabMenuItems.length > 0 && (
          <KebabWrapper>
            <KebabMenu items={kebabMenuItems} />
          </KebabWrapper>
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

              {result.success && result.diff && (
                <DiffContainer>
                  {showRaw ? (
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {result.diff}
                    </pre>
                  ) : (
                    renderDiff(result.diff, filePath, onReviewNote)
                  )}
                </DiffContainer>
              )}
            </>
          )}

          {status === "executing" && !result && (
            <DetailSection>
              <div style={{ fontSize: "11px", color: "var(--color-text-secondary)" }}>
                Waiting for result
                <LoadingDots />
              </div>
            </DetailSection>
          )}
        </ToolDetails>
      )}
    </ToolContainer>
  );
};
