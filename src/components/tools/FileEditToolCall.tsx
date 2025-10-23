import React from "react";
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
                fontSize="11px"
                onReviewNote={onReviewNote}
              />
            ) : (
              <DiffRenderer
                content={hunk.lines.join("\n")}
                showLineNumbers={true}
                oldStart={hunk.oldStart}
                newStart={hunk.newStart}
                filePath={filePath}
                fontSize="11px"
              />
            )}
          </React.Fragment>
        ))}
      </React.Fragment>
    ));
  } catch (error) {
    return (
      <div className="text-danger text-[11px] px-2 py-1.5 bg-danger-overlay rounded border-l-2 border-danger">
        Failed to parse diff: {String(error)}
      </div>
    );
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
      <ToolHeader className="cursor-default hover:text-secondary">
        <div
          onClick={toggleExpanded}
          className="flex items-center gap-2 flex-1 cursor-pointer hover:text-text"
        >
          <ExpandIcon expanded={expanded}>▶</ExpandIcon>
          <TooltipWrapper inline>
            <span>✏️</span>
            <Tooltip>{toolName}</Tooltip>
          </TooltipWrapper>
          <span className="text-text font-monospace whitespace-nowrap overflow-hidden text-ellipsis max-w-[400px]">
            {filePath}
          </span>
        </div>
        {!(result && result.success && result.diff) && (
          <StatusIndicator status={status}>{getStatusDisplay(status)}</StatusIndicator>
        )}
        {kebabMenuItems.length > 0 && (
          <div className="mr-2">
            <KebabMenu items={kebabMenuItems} />
          </div>
        )}
      </ToolHeader>

      {expanded && (
        <ToolDetails>
          {result && (
            <>
              {result.success === false && result.error && (
                <DetailSection>
                  <DetailLabel>Error</DetailLabel>
                  <div className="text-danger text-[11px] px-2 py-1.5 bg-danger-overlay rounded border-l-2 border-danger">
                    {result.error}
                  </div>
                </DetailSection>
              )}

              {result.success && result.diff && (
                <DiffContainer>
                  {showRaw ? (
                    <pre className="m-0 whitespace-pre-wrap break-words">{result.diff}</pre>
                  ) : (
                    renderDiff(result.diff, filePath, onReviewNote)
                  )}
                </DiffContainer>
              )}
            </>
          )}

          {status === "executing" && !result && (
            <DetailSection>
              <div className="text-[11px] text-secondary">
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
