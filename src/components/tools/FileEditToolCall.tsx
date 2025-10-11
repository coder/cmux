import React from "react";
import styled from "@emotion/styled";
import { parsePatch } from "diff";
import type {
  FileEditReplaceToolArgs,
  FileEditReplaceToolResult,
  FileEditInsertToolArgs,
  FileEditInsertToolResult,
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

// File edit specific styled components

const FilePath = styled.span`
  color: var(--color-text);
  font-family: var(--font-monospace);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 400px;
`;

const DiffContainer = styled.div`
  margin: 0;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
  font-size: 11px;
  line-height: 1.4;
  max-height: 400px;
  overflow-y: auto;
`;

// Shared type for diff line types
type DiffLineType = "add" | "remove" | "context" | "header";

// Helper function for computing contrast color for add/remove indicators
const getContrastColor = (type: DiffLineType) => {
  return type === "add" || type === "remove"
    ? "color-mix(in srgb, var(--color-text-secondary), white 50%)"
    : "var(--color-text-secondary)";
};

const DiffLine = styled.div<{ type: DiffLineType }>`
  font-family: var(--font-monospace);
  white-space: pre;
  display: flex;
  padding: ${({ type }) => (type === "header" ? "4px 0" : "0")};
  color: ${({ type }) => {
    switch (type) {
      case "add":
        return "#4caf50";
      case "remove":
        return "#f44336";
      case "header":
        return "#2196f3";
      case "context":
      default:
        return "var(--color-text)";
    }
  }};
  background: ${({ type }) => {
    switch (type) {
      case "add":
        return "rgba(46, 160, 67, 0.15)";
      case "remove":
        return "rgba(248, 81, 73, 0.15)";
      default:
        return "transparent";
    }
  }};
`;

const LineNumber = styled.span<{ type: DiffLineType }>`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 35px;
  padding-right: 4px;
  font-size: ${({ type }) => (type === "header" ? "14px" : "inherit")};
  font-weight: ${({ type }) => (type === "header" ? "bold" : "normal")};
  color: ${({ type }) => getContrastColor(type)};
  opacity: ${({ type }) => (type === "add" || type === "remove" ? 0.9 : 0.6)};
  user-select: none;
  flex-shrink: 0;
  background: ${({ type }) => {
    switch (type) {
      case "add":
        return "rgba(46, 160, 67, 0.3)";
      case "remove":
        return "rgba(248, 81, 73, 0.3)";
      default:
        return "transparent";
    }
  }};
`;

const LineContent = styled.span<{ type: DiffLineType }>`
  flex: 1;
  padding-left: 8px;
  color: ${({ type }) => {
    switch (type) {
      case "header":
        return "#2196f3";
      case "context":
        return "var(--color-text-secondary)";
      case "add":
      case "remove":
        return "var(--color-text)";
    }
  }};
`;

const DiffIndicator = styled.span<{ type: DiffLineType }>`
  display: inline-block;
  width: 4px;
  text-align: center;
  color: ${({ type }) => getContrastColor(type)};
  opacity: ${({ type }) => (type === "add" || type === "remove" ? 0.9 : 0.6)};
  flex-shrink: 0;
  background: ${({ type }) => {
    switch (type) {
      case "add":
        return "rgba(46, 160, 67, 0.3)";
      case "remove":
        return "rgba(248, 81, 73, 0.3)";
      default:
        return "transparent";
    }
  }};
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

type FileEditToolArgs = FileEditReplaceToolArgs | FileEditInsertToolArgs;
type FileEditToolResult = FileEditReplaceToolResult | FileEditInsertToolResult;

interface FileEditToolCallProps {
  toolName: "file_edit_replace" | "file_edit_insert";
  args: FileEditToolArgs;
  result?: FileEditToolResult;
  status?: ToolStatus;
}

function renderDiff(diff: string): React.ReactNode {
  try {
    const patches = parsePatch(diff);
    if (patches.length === 0) {
      return (
        <DiffLine type="context">
          <LineContent type="context">No changes</LineContent>
        </DiffLine>
      );
    }

    return patches.map((patch, patchIdx) => (
      <React.Fragment key={patchIdx}>
        {patch.hunks.map((hunk, hunkIdx) => {
          let oldLineNum = hunk.oldStart;
          let newLineNum = hunk.newStart;

          return (
            <React.Fragment key={hunkIdx}>
              <DiffLine type="header">
                <DiffIndicator type="header">{/* Empty for alignment */}</DiffIndicator>
                <LineNumber type="header">{hunkIdx > 0 ? "⋮" : ""}</LineNumber>
                <LineContent type="header">
                  @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
                </LineContent>
              </DiffLine>
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
                  <DiffLine key={lineIdx} type={type}>
                    <DiffIndicator type={type}>{firstChar}</DiffIndicator>
                    <LineNumber type={type}>{lineNumDisplay}</LineNumber>
                    <LineContent type={type}>{content}</LineContent>
                  </DiffLine>
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

  const filePath = args.file_path;

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
