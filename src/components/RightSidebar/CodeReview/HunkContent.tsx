/**
 * HunkContent - Main content area for a hunk with read-more functionality
 */

import React, { useMemo } from "react";
import type { DiffHunk, HunkReadMoreState } from "@/types/review";
import type { SearchHighlightConfig } from "@/utils/highlighting/highlightSearchTerms";
import { SelectableDiffRenderer } from "../../shared/DiffRenderer";
import { ExpanderArrow } from "./ExpanderArrow";
import { EOFMarker } from "./EOFMarker";
import { calculateUpwardExpansion } from "@/utils/review/readFileLines";

interface ExpansionState {
  content: string;
  isLoading: boolean;
  onExpand: (e: React.MouseEvent) => void;
  onCollapse: (e: React.MouseEvent) => void;
  isExpanded: boolean;
  canExpand: boolean;
}

interface HunkContentProps {
  /** The hunk to display */
  hunk: DiffHunk;
  /** Hunk ID for event handling */
  hunkId: string;
  /** Read-more expansion state */
  readMoreState: HunkReadMoreState;
  /** Upward expansion state */
  upExpansion: ExpansionState;
  /** Downward expansion state */
  downExpansion: ExpansionState;
  /** Handler for line clicks (triggers parent onClick) */
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  /** Handler for review notes */
  onReviewNote?: (note: string) => void;
  /** Search configuration for highlighting */
  searchConfig?: SearchHighlightConfig;
}

export const HunkContent = React.memo<HunkContentProps>(
  ({
    hunk,
    hunkId,
    readMoreState,
    upExpansion,
    downExpansion,
    onClick,
    onReviewNote,
    searchConfig,
  }) => {
    // Calculate expansion metadata
    const upwardExpansion = calculateUpwardExpansion(hunk.oldStart, readMoreState.up);
    const canExpandUp = upwardExpansion.startLine >= 1 && upwardExpansion.numLines > 0;

    // Check if we've reached beginning of file (line 1)
    const atBeginningOfFile = upExpansion.isExpanded && upwardExpansion.startLine === 1;

    // Detect EOF: if downward expansion returned fewer lines than expected (30 lines per expansion)
    // This means we hit the end of the file on the last expansion
    const atEndOfFile = useMemo(() => {
      if (!downExpansion.content || readMoreState.down === 0) return false;
      const lines = downExpansion.content.split("\n").filter((l) => l.length > 0);
      // If we have expansion but got fewer lines than requested, we're at EOF
      return lines.length < readMoreState.down;
    }, [downExpansion.content, readMoreState.down]);

    // Combine all content into single unified diff for proper syntax highlighting
    // This ensures grammar state (multi-line comments, strings, etc.) spans correctly
    const combinedContent = useMemo(() => {
      const parts: string[] = [];

      if (upExpansion.content) {
        parts.push(upExpansion.content);
      }

      parts.push(hunk.content);

      if (downExpansion.content) {
        parts.push(downExpansion.content);
      }

      return parts.join("\n");
    }, [upExpansion.content, hunk.content, downExpansion.content]);

    // Calculate starting line number for combined content
    const combinedStartLine = upExpansion.content ? upwardExpansion.startLine : hunk.oldStart;

    return (
      <div className="px-2 py-1.5">
        <SelectableDiffRenderer
          content={combinedContent}
          filePath={hunk.filePath}
          oldStart={combinedStartLine}
          newStart={combinedStartLine}
          maxHeight="none"
          onReviewNote={onReviewNote}
          onLineClick={() => {
            // Create synthetic event with data-hunk-id for parent handler
            const syntheticEvent = {
              currentTarget: { dataset: { hunkId } },
            } as unknown as React.MouseEvent<HTMLElement>;
            onClick?.(syntheticEvent);
          }}
          searchConfig={searchConfig}
          expanderTop={
            <>
              {/* Show BOF marker if we've reached the beginning of file */}
              {atBeginningOfFile && (
                <div className="block w-full">
                  <div className="flex px-2 font-mono text-[11px] whitespace-pre">
                    <span className="inline-block w-1 shrink-0 text-center opacity-40">·</span>
                    <span className="flex min-w-9 shrink-0 items-center justify-end pr-1 select-none">
                      <span className="text-[9px] opacity-40">BOF</span>
                    </span>
                    <span className="pl-2 text-[11px] italic opacity-40">Beginning of file</span>
                  </div>
                </div>
              )}

              {/* Collapse arrow - show if currently expanded */}
              {upExpansion.isExpanded && (
                <ExpanderArrow
                  direction="up"
                  mode="collapse"
                  isLoading={upExpansion.isLoading}
                  onClick={upExpansion.onCollapse}
                />
              )}

              {/* Expand arrow - show if can expand more */}
              {canExpandUp && !atBeginningOfFile && (
                <ExpanderArrow
                  direction="up"
                  mode="expand"
                  isLoading={upExpansion.isLoading}
                  onClick={upExpansion.onExpand}
                />
              )}
            </>
          }
          expanderBottom={
            <>
              {/* Expand arrow - show if can expand more */}
              {downExpansion.canExpand && !atEndOfFile && (
                <ExpanderArrow
                  direction="down"
                  mode="expand"
                  isLoading={downExpansion.isLoading}
                  onClick={downExpansion.onExpand}
                />
              )}

              {/* Collapse arrow - show if currently expanded */}
              {downExpansion.isExpanded && (
                <ExpanderArrow
                  direction="down"
                  mode="collapse"
                  isLoading={downExpansion.isLoading}
                  onClick={downExpansion.onCollapse}
                />
              )}

              {/* EOF marker - show if we've reached end of file */}
              {atEndOfFile && <EOFMarker />}
            </>
          }
        />
      </div>
    );
  }
);

HunkContent.displayName = "HunkContent";
