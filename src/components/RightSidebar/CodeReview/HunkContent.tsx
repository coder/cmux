/**
 * HunkContent - Main content area for a hunk with read-more functionality
 */

import React from "react";
import type { DiffHunk, HunkReadMoreState } from "@/types/review";
import type { SearchHighlightConfig } from "@/utils/highlighting/highlightSearchTerms";
import { SelectableDiffRenderer } from "../../shared/DiffRenderer";
import { ReadMoreButton } from "./ReadMoreButton";
import { ExpandedDiffContent } from "./ExpandedDiffContent";
import { calculateUpwardExpansion, calculateDownwardExpansion } from "@/utils/review/readFileLines";

interface HunkContentProps {
  /** The hunk to display */
  hunk: DiffHunk;
  /** Hunk ID for event handling */
  hunkId: string;
  /** Read-more expansion state */
  readMoreState: HunkReadMoreState;
  /** Expanded content upward */
  expandedContentUp: string;
  /** Expanded content downward */
  expandedContentDown: string;
  /** Loading state for upward expansion */
  isLoadingUp: boolean;
  /** Loading state for downward expansion */
  isLoadingDown: boolean;
  /** Handler for expand up */
  onExpandUp: (e: React.MouseEvent) => void;
  /** Handler for expand down */
  onExpandDown: (e: React.MouseEvent) => void;
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
    expandedContentUp,
    expandedContentDown,
    isLoadingUp,
    isLoadingDown,
    onExpandUp,
    onExpandDown,
    onClick,
    onReviewNote,
    searchConfig,
  }) => {
    // Calculate if upward expansion is possible
    const upwardExpansion = calculateUpwardExpansion(hunk.oldStart, readMoreState.up);
    const canExpandUp = upwardExpansion.startLine >= 1 && upwardExpansion.numLines > 0;

    // Calculate downward expansion info
    const downwardExpansion = calculateDownwardExpansion(
      hunk.oldStart,
      hunk.oldLines,
      readMoreState.down
    );

    return (
      <div className="font-monospace bg-code-bg grid grid-cols-[minmax(min-content,1fr)] overflow-x-auto text-[11px] leading-[1.4]">
        {/* Read more upward button */}
        {canExpandUp && (
          <ReadMoreButton
            direction="up"
            numLines={upwardExpansion.numLines}
            isLoading={isLoadingUp}
            onClick={onExpandUp}
          />
        )}

        {/* Expanded content upward */}
        <ExpandedDiffContent
          content={expandedContentUp}
          filePath={hunk.filePath}
          startLine={upwardExpansion.startLine}
          searchConfig={searchConfig}
        />

        {/* Original hunk content */}
        <div className="px-2 py-1.5">
          <SelectableDiffRenderer
            content={hunk.content}
            filePath={hunk.filePath}
            oldStart={hunk.oldStart}
            newStart={hunk.newStart}
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
          />
        </div>

        {/* Expanded content downward */}
        <ExpandedDiffContent
          content={expandedContentDown}
          filePath={hunk.filePath}
          startLine={downwardExpansion.startLine}
          searchConfig={searchConfig}
        />

        {/* Read more downward button */}
        <div className="border-border-light border-t px-2 py-1.5">
          <button
            onClick={onExpandDown}
            disabled={isLoadingDown}
            className="text-muted hover:text-foreground disabled:text-muted w-full text-center text-[11px] italic disabled:cursor-not-allowed"
          >
            {isLoadingDown ? "Loading..." : "Read 30 more lines ↓"}
          </button>
        </div>
      </div>
    );
  }
);

HunkContent.displayName = "HunkContent";
