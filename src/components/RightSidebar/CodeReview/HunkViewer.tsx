/**
 * HunkViewer - Displays a single diff hunk with syntax highlighting
 */

import React, { useState, useMemo } from "react";
import type { DiffHunk } from "@/types/review";
import { SelectableDiffRenderer } from "../../shared/DiffRenderer";
import {
  type SearchHighlightConfig,
  highlightSearchInText,
} from "@/utils/highlighting/highlightSearchTerms";
import { Tooltip, TooltipWrapper } from "../../Tooltip";
import { usePersistedState } from "@/hooks/usePersistedState";
import { getReviewExpandStateKey } from "@/constants/storage";
import { KEYBINDS, formatKeybind } from "@/utils/ui/keybinds";
import { cn } from "@/lib/utils";

interface HunkViewerProps {
  hunk: DiffHunk;
  hunkId: string;
  workspaceId: string;
  isSelected?: boolean;
  isRead?: boolean;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  onToggleRead?: (e: React.MouseEvent<HTMLElement>) => void;
  onRegisterToggleExpand?: (hunkId: string, toggleFn: () => void) => void;
  onReviewNote?: (note: string) => void;
  searchConfig?: SearchHighlightConfig;
}

export const HunkViewer = React.memo<HunkViewerProps>(
  ({
    hunk,
    hunkId,
    workspaceId,
    isSelected,
    isRead = false,
    onClick,
    onToggleRead,
    onRegisterToggleExpand,
    onReviewNote,
    searchConfig,
  }) => {
    // Parse diff lines (memoized - only recompute if hunk.content changes)
    // Must be done before state initialization to determine initial collapse state
    const { lineCount, additions, deletions, isLargeHunk } = React.useMemo(() => {
      const lines = hunk.content.split("\n").filter((line) => line.length > 0);
      const count = lines.length;
      return {
        lineCount: count,
        additions: lines.filter((line) => line.startsWith("+")).length,
        deletions: lines.filter((line) => line.startsWith("-")).length,
        isLargeHunk: count > 200, // Memoize to prevent useEffect re-runs
      };
    }, [hunk.content]);

    // Highlight filePath if search is active
    const highlightedFilePath = useMemo(() => {
      if (!searchConfig) {
        return hunk.filePath;
      }
      return highlightSearchInText(hunk.filePath, searchConfig);
    }, [hunk.filePath, searchConfig]);

    // Persist manual expand/collapse state across remounts per workspace
    // Maps hunkId -> isExpanded for user's manual preferences
    // Enable listener to synchronize updates across all HunkViewer instances
    const [expandStateMap, setExpandStateMap] = usePersistedState<Record<string, boolean>>(
      getReviewExpandStateKey(workspaceId),
      {},
      { listener: true }
    );

    // Check if user has manually set expand state for this hunk
    const hasManualState = hunkId in expandStateMap;
    const manualExpandState = expandStateMap[hunkId];

    // Determine initial expand state (priority: manual > read status > size)
    const [isExpanded, setIsExpanded] = useState(() => {
      if (hasManualState) {
        return manualExpandState;
      }
      return !isRead && !isLargeHunk;
    });

    // Auto-collapse when marked as read, auto-expand when unmarked (unless user manually set)
    React.useEffect(() => {
      // Don't override manual expand/collapse choices
      if (hasManualState) {
        return;
      }

      if (isRead) {
        setIsExpanded(false);
      } else if (!isLargeHunk) {
        setIsExpanded(true);
      }
      // Note: When unmarking as read, large hunks remain collapsed
    }, [isRead, isLargeHunk, hasManualState]);

    // Sync local state with persisted state when it changes
    React.useEffect(() => {
      if (hasManualState) {
        setIsExpanded(manualExpandState);
      }
    }, [hasManualState, manualExpandState]);

    const handleToggleExpand = React.useCallback(
      (e?: React.MouseEvent) => {
        e?.stopPropagation();
        const newExpandState = !isExpanded;
        setIsExpanded(newExpandState);
        // Persist manual expand/collapse choice
        setExpandStateMap((prev) => ({
          ...prev,
          [hunkId]: newExpandState,
        }));
      },
      [isExpanded, hunkId, setExpandStateMap]
    );

    // Register toggle method with parent component
    React.useEffect(() => {
      if (onRegisterToggleExpand) {
        onRegisterToggleExpand(hunkId, handleToggleExpand);
      }
    }, [hunkId, onRegisterToggleExpand, handleToggleExpand]);

    const handleToggleRead = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onToggleRead?.(e);
    };

    // Detect pure rename: if renamed and content hasn't changed (zero additions and deletions)
    const isPureRename =
      hunk.changeType === "renamed" && hunk.oldPath && additions === 0 && deletions === 0;

    return (
      <div
        className={cn(
          "bg-bg-dark border rounded mb-3 overflow-hidden cursor-pointer transition-all duration-200",
          "focus:outline-none focus-visible:outline-none",
          isRead ? "border-[var(--color-read)]" : "border-border-light",
          isSelected &&
            "border-[var(--color-review-accent)] shadow-[0_0_0_1px_var(--color-review-accent)]"
        )}
        onClick={onClick}
        role="button"
        tabIndex={0}
        data-hunk-id={hunkId}
      >
        <div className="bg-separator py-2 px-3 border-b border-border-light flex justify-between items-center font-monospace text-xs gap-2">
          {isRead && (
            <TooltipWrapper inline>
              <span
                className="inline-flex items-center text-[var(--color-read)] text-sm mr-1"
                aria-label="Marked as read"
              >
                ✓
              </span>
              <Tooltip align="center" position="top">
                Marked as read
              </Tooltip>
            </TooltipWrapper>
          )}
          <div
            className="text-foreground font-medium whitespace-nowrap overflow-hidden text-ellipsis min-w-0"
            dangerouslySetInnerHTML={{ __html: highlightedFilePath }}
          />
          <div className="flex items-center gap-2 text-[11px] whitespace-nowrap flex-shrink-0">
            {!isPureRename && (
              <span className="flex gap-2 text-[11px]">
                {additions > 0 && <span className="text-[#4ade80]">+{additions}</span>}
                {deletions > 0 && <span className="text-[#f87171]">-{deletions}</span>}
              </span>
            )}
            <span className="text-muted">
              ({lineCount} {lineCount === 1 ? "line" : "lines"})
            </span>
            {onToggleRead && (
              <TooltipWrapper inline>
                <button
                  className="bg-transparent border border-border-light rounded-[3px] py-0.5 px-1.5 text-muted text-[11px] cursor-pointer transition-all duration-200 flex items-center gap-1 hover:bg-white/5 hover:border-[var(--color-read)] hover:text-[var(--color-read)] active:scale-95"
                  data-hunk-id={hunkId}
                  onClick={handleToggleRead}
                  aria-label={`Mark as read (${formatKeybind(KEYBINDS.TOGGLE_HUNK_READ)})`}
                >
                  {isRead ? "○" : "◉"}
                </button>
                <Tooltip align="right" position="top">
                  Mark as read ({formatKeybind(KEYBINDS.TOGGLE_HUNK_READ)})
                </Tooltip>
              </TooltipWrapper>
            )}
          </div>
        </div>

        {isPureRename ? (
          <div className="p-3 text-muted text-[11px] flex items-center gap-2 bg-[rgba(100,150,255,0.05)] before:content-['→'] before:text-sm before:text-[#6496ff]">
            Renamed from <code>{hunk.oldPath}</code>
          </div>
        ) : isExpanded ? (
          <div className="py-1.5 px-2 font-monospace text-[11px] leading-[1.4] overflow-x-auto bg-code-bg grid grid-cols-[minmax(min-content,1fr)]">
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
        ) : (
          <div
            className="py-2 px-3 text-center text-muted text-[11px] italic cursor-pointer hover:text-foreground"
            onClick={handleToggleExpand}
          >
            {isRead && "Hunk marked as read. "}Click to expand ({lineCount} lines) or press{" "}
            {formatKeybind(KEYBINDS.TOGGLE_HUNK_COLLAPSE)}
          </div>
        )}

        {hasManualState && isExpanded && !isPureRename && (
          <div
            className="py-2 px-3 text-center text-muted text-[11px] italic cursor-pointer hover:text-foreground"
            onClick={handleToggleExpand}
          >
            Click here or press {formatKeybind(KEYBINDS.TOGGLE_HUNK_COLLAPSE)} to collapse
          </div>
        )}
      </div>
    );
  }
);

HunkViewer.displayName = "HunkViewer";
