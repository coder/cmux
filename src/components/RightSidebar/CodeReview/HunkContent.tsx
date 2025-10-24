/**
 * HunkContent - Main content area for a hunk with read-more functionality
 */

import React, { useMemo } from "react";
import type { DiffHunk, HunkReadMoreState } from "@/types/review";
import type { SearchHighlightConfig } from "@/utils/highlighting/highlightSearchTerms";
import { SelectableDiffRenderer } from "../../shared/DiffRenderer";
import { ReadMoreButton } from "./ReadMoreButton";
import { calculateUpwardExpansion, LINES_PER_EXPANSION } from "@/utils/review/readFileLines";

interface ExpansionState {
  content: string;
  isLoading: boolean;
  onExpand: (e: React.MouseEvent) => void;
  onCollapse: (e: React.MouseEvent) => void;
  canCollapse: boolean;
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
      <div className="font-monospace bg-code-bg grid grid-cols-[minmax(min-content,1fr)] overflow-x-auto text-[11px] leading-[1.4]">
        {/* Expand upward button - show if can expand further */}
        {canExpandUp && (
          <ReadMoreButton
            direction="up"
            action="expand"
            numLines={LINES_PER_EXPANSION}
            isLoading={upExpansion.isLoading}
            onClick={upExpansion.onExpand}
          />
        )}

        {/* Combined content - single pass through syntax highlighter */}
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
          />
        </div>

        {/* Collapse upward button - show if currently expanded upward */}
        {upExpansion.canCollapse && (
          <ReadMoreButton
            direction="up"
            action="collapse"
            numLines={Math.min(LINES_PER_EXPANSION, readMoreState.up)}
            isLoading={false}
            onClick={upExpansion.onCollapse}
          />
        )}

        {/* Collapse downward button - show if currently expanded downward */}
        {downExpansion.canCollapse && (
          <ReadMoreButton
            direction="down"
            action="collapse"
            numLines={Math.min(LINES_PER_EXPANSION, readMoreState.down)}
            isLoading={false}
            onClick={downExpansion.onCollapse}
          />
        )}

        {/* Expand downward button */}
        <ReadMoreButton
          direction="down"
          action="expand"
          numLines={LINES_PER_EXPANSION}
          isLoading={downExpansion.isLoading}
          onClick={downExpansion.onExpand}
        />
      </div>
    );
  }
);

HunkContent.displayName = "HunkContent";
