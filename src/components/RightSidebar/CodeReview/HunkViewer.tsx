/**
 * HunkViewer - Displays a single diff hunk with syntax highlighting
 */

import React, { useState, useMemo } from "react";
import type { DiffHunk, HunkReadMoreState } from "@/types/review";
import type { SearchHighlightConfig } from "@/utils/highlighting/highlightSearchTerms";
import { highlightSearchInText } from "@/utils/highlighting/highlightSearchTerms";
import { usePersistedState } from "@/hooks/usePersistedState";
import { getReviewExpandStateKey, getReviewReadMoreStateKey } from "@/constants/storage";
import { KEYBINDS, formatKeybind } from "@/utils/ui/keybinds";
import { cn } from "@/lib/utils";
import {
  readFileLines,
  calculateUpwardExpansion,
  calculateDownwardExpansion,
  formatAsContextLines,
  getOldFileRef,
} from "@/utils/review/readFileLines";
import { HunkHeader } from "./HunkHeader";
import { HunkContent } from "./HunkContent";

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
  /** Diff base for determining which git ref to read from */
  diffBase: string;
  /** Whether uncommitted changes are included in the diff */
  includeUncommitted: boolean;
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
    diffBase,
    includeUncommitted,
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

    // Read-more state: tracks expanded lines up/down per hunk
    const [readMoreStateMap, setReadMoreStateMap] = usePersistedState<
      Record<string, HunkReadMoreState>
    >(getReviewReadMoreStateKey(workspaceId), {}, { listener: true });

    const readMoreState = useMemo(
      () => readMoreStateMap[hunkId] || { up: 0, down: 0 },
      [readMoreStateMap, hunkId]
    );

    // State for expanded content
    const [expandedContentUp, setExpandedContentUp] = useState<string>("");
    const [expandedContentDown, setExpandedContentDown] = useState<string>("");
    const [isLoadingUp, setIsLoadingUp] = useState(false);
    const [isLoadingDown, setIsLoadingDown] = useState(false);

    // Determine which git ref to read the old file from
    const gitRef = useMemo(
      () => getOldFileRef(diffBase, includeUncommitted),
      [diffBase, includeUncommitted]
    );

    // Load expanded content when read-more state changes
    React.useEffect(() => {
      if (readMoreState.up > 0) {
        const expansion = calculateUpwardExpansion(hunk.oldStart, readMoreState.up);
        if (expansion.numLines > 0) {
          setIsLoadingUp(true);
          void readFileLines(
            workspaceId,
            hunk.filePath,
            expansion.startLine,
            expansion.endLine,
            gitRef
          )
            .then((lines) => {
              if (lines) {
                setExpandedContentUp(formatAsContextLines(lines));
              }
            })
            .finally(() => setIsLoadingUp(false));
        }
      } else {
        setExpandedContentUp("");
      }
    }, [readMoreState.up, hunk.oldStart, hunk.filePath, workspaceId, gitRef]);

    React.useEffect(() => {
      if (readMoreState.down > 0) {
        const expansion = calculateDownwardExpansion(
          hunk.oldStart,
          hunk.oldLines,
          readMoreState.down
        );
        setIsLoadingDown(true);
        void readFileLines(
          workspaceId,
          hunk.filePath,
          expansion.startLine,
          expansion.endLine,
          gitRef
        )
          .then((lines) => {
            if (lines) {
              setExpandedContentDown(formatAsContextLines(lines));
            } else {
              // No lines returned - at EOF
              setExpandedContentDown("");
            }
          })
          .finally(() => setIsLoadingDown(false));
      } else {
        setExpandedContentDown("");
      }
    }, [readMoreState.down, hunk.oldStart, hunk.oldLines, hunk.filePath, workspaceId, gitRef]);

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

    const handleExpandUp = React.useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        const expansion = calculateUpwardExpansion(hunk.oldStart, readMoreState.up);
        if (expansion.startLine < 1 || expansion.numLines <= 0) {
          // Already at beginning of file
          return;
        }
        setReadMoreStateMap((prev) => ({
          ...prev,
          [hunkId]: {
            ...readMoreState,
            up: readMoreState.up + 30,
          },
        }));
      },
      [hunkId, hunk.oldStart, readMoreState, setReadMoreStateMap]
    );

    const handleCollapseUp = React.useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        const newExpansion = Math.max(0, readMoreState.up - 30);
        setReadMoreStateMap((prev) => ({
          ...prev,
          [hunkId]: {
            ...readMoreState,
            up: newExpansion,
          },
        }));
      },
      [hunkId, readMoreState, setReadMoreStateMap]
    );

    const handleExpandDown = React.useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        setReadMoreStateMap((prev) => ({
          ...prev,
          [hunkId]: {
            ...readMoreState,
            down: readMoreState.down + 30,
          },
        }));
      },
      [hunkId, readMoreState, setReadMoreStateMap]
    );

    const handleCollapseDown = React.useCallback(
      (e: React.MouseEvent) => {
        e.stopPropagation();
        const newExpansion = Math.max(0, readMoreState.down - 30);
        setReadMoreStateMap((prev) => ({
          ...prev,
          [hunkId]: {
            ...readMoreState,
            down: newExpansion,
          },
        }));
      },
      [hunkId, readMoreState, setReadMoreStateMap]
    );

    // Detect pure rename: if renamed and content hasn't changed (zero additions and deletions)
    const isPureRename =
      hunk.changeType === "renamed" && !!hunk.oldPath && additions === 0 && deletions === 0;

    return (
      <div
        className={cn(
          "bg-dark border rounded mb-3 overflow-hidden cursor-pointer transition-all duration-200",
          "focus:outline-none focus-visible:outline-none",
          isRead ? "border-read" : "border-border-light",
          isSelected && "border-review-accent shadow-[0_0_0_1px_var(--color-review-accent)]"
        )}
        onClick={onClick}
        role="button"
        tabIndex={0}
        data-hunk-id={hunkId}
      >
        <HunkHeader
          highlightedFilePath={highlightedFilePath}
          isRead={isRead}
          additions={additions}
          deletions={deletions}
          lineCount={lineCount}
          isPureRename={isPureRename}
          hunkId={hunkId}
          onToggleRead={onToggleRead ? handleToggleRead : undefined}
        />

        {isPureRename ? (
          <div className="text-muted bg-code-keyword-overlay-light before:text-code-keyword flex items-center gap-2 p-3 text-[11px] before:text-sm before:content-['→']">
            Renamed from <code>{hunk.oldPath}</code>
          </div>
        ) : isExpanded ? (
          <HunkContent
            hunk={hunk}
            hunkId={hunkId}
            readMoreState={readMoreState}
            upExpansion={{
              content: expandedContentUp,
              isLoading: isLoadingUp,
              onExpand: handleExpandUp,
              onCollapse: handleCollapseUp,
              isExpanded: readMoreState.up > 0,
              canExpand: calculateUpwardExpansion(hunk.oldStart, readMoreState.up).numLines > 0,
            }}
            downExpansion={{
              content: expandedContentDown,
              isLoading: isLoadingDown,
              onExpand: handleExpandDown,
              onCollapse: handleCollapseDown,
              isExpanded: readMoreState.down > 0,
              canExpand: true, // Always allow expanding downward
            }}
            onClick={onClick}
            onReviewNote={onReviewNote}
            searchConfig={searchConfig}
          />
        ) : (
          <div
            className="text-muted hover:text-foreground cursor-pointer px-3 py-2 text-center text-[11px] italic"
            onClick={handleToggleExpand}
          >
            {isRead && "Hunk marked as read. "}Click to expand ({lineCount} lines) or press{" "}
            {formatKeybind(KEYBINDS.TOGGLE_HUNK_COLLAPSE)}
          </div>
        )}

        {hasManualState && isExpanded && !isPureRename && (
          <div
            className="text-muted hover:text-foreground cursor-pointer px-3 py-2 text-center text-[11px] italic"
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
