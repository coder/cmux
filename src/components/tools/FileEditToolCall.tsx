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
  HeaderButton,
} from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay, type ToolStatus } from "./shared/toolUtils";
import { TooltipWrapper, Tooltip } from "../Tooltip";
import {
  DiffContainer,
  DiffLine,
  DiffLineWrapper,
  LineNumber,
  LineContent,
  DiffIndicator,
  type DiffLineType,
} from "../shared/DiffRenderer";

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

const ButtonGroup = styled.div`
  display: flex;
  gap: 6px;
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
}

function renderDiff(diff: string): React.ReactNode {
  try {
    const patches = parsePatch(diff);
    if (patches.length === 0) {
      return (
        <DiffLineWrapper type="context">
          <DiffLine type="context">
            <LineContent type="context">No changes</LineContent>
          </DiffLine>
        </DiffLineWrapper>
      );
    }

    return patches.map((patch, patchIdx) => (
      <React.Fragment key={patchIdx}>
        {patch.hunks.map((hunk, hunkIdx) => {
          let oldLineNum = hunk.oldStart;
          let newLineNum = hunk.newStart;

          return (
            <React.Fragment key={hunkIdx}>
              <DiffLineWrapper type="header">
                <DiffLine type="header">
                  <DiffIndicator type="header">{/* Empty for alignment */}</DiffIndicator>
                  <LineNumber type="header">{hunkIdx > 0 ? "⋮" : ""}</LineNumber>
                  <LineContent type="header">
                    @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                  </LineContent>
                </DiffLine>
              </DiffLineWrapper>
              {hunk.lines.map((line, lineIdx) => {
                const firstChar = line[0];
                const content = line.slice(1); // Remove the +/- prefix
                let type: DiffLineType = "context";
                let lineNumDisplay = "";

                if (firstChar === "+") {
                  type = "add";
                  lineNumDisplay = `${newLineNum}`;
                  newLineNum++;
                } else if (firstChar === "-") {
                  type = "remove";
                  lineNumDisplay = `${oldLineNum}`;
                  oldLineNum++;
                } else {
                  // Context line
                  lineNumDisplay = `${oldLineNum}`;
                  oldLineNum++;
                  newLineNum++;
                }

                return (
                  <DiffLineWrapper key={lineIdx} type={type}>
                    <DiffLine type={type}>
                      <DiffIndicator type={type}>{firstChar}</DiffIndicator>
                      <LineNumber type={type}>{lineNumDisplay}</LineNumber>
                      <LineContent type={type}>{content}</LineContent>
                    </DiffLine>
                  </DiffLineWrapper>
                );
              })}
            </React.Fragment>
          );
        })}
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
        {result && result.success && result.diff && (
          <ButtonGroup>
            <HeaderButton
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                void handleCopyPatch();
              }}
            >
              {copied ? "✓ Copied" : "Copy Patch"}
            </HeaderButton>
            <HeaderButton
              active={showRaw}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                setShowRaw(!showRaw);
              }}
            >
              {showRaw ? "Show Parsed" : "Show Patch"}
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

              {result.success && result.diff && (
                <DiffContainer>
                  {showRaw ? (
                    <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {result.diff}
                    </pre>
                  ) : (
                    renderDiff(result.diff)
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
