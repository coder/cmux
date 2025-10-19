/**
 * HunkViewer - Displays a single diff hunk with syntax highlighting
 */

import React, { useState } from "react";
import styled from "@emotion/styled";
import type { DiffHunk } from "@/types/review";
import { SelectableDiffRenderer } from "../../shared/DiffRenderer";
import { Tooltip, TooltipWrapper } from "../../Tooltip";
import { usePersistedState } from "@/hooks/usePersistedState";
import { getReviewExpandStateKey } from "@/constants/storage";

interface HunkViewerProps {
  hunk: DiffHunk;
  hunkId: string;
  workspaceId: string;
  isSelected?: boolean;
  isRead?: boolean;
  onClick?: (e: React.MouseEvent<HTMLElement>) => void;
  onToggleRead?: (e: React.MouseEvent<HTMLElement>) => void;
  onReviewNote?: (note: string) => void;
}

const HunkContainer = styled.div<{ isSelected: boolean; isRead: boolean }>`
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  margin-bottom: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;

  ${(props) =>
    props.isRead &&
    `
    border-color: var(--color-read);
  `}

  ${(props) =>
    props.isSelected &&
    `
    border-color: var(--color-review-accent);
    box-shadow: 0 0 0 1px var(--color-review-accent);
  `}
`;

const HunkHeader = styled.div`
  /* Keep grayscale to avoid clashing with green/red LoC indicators */
  background: #252526;
  padding: 8px 12px;
  border-bottom: 1px solid #3e3e42;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--font-monospace);
  font-size: 12px;
  gap: 8px;
`;

const FilePath = styled.div`
  color: #cccccc;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
`;

const LineInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  white-space: nowrap;
  flex-shrink: 0;
`;

const LocStats = styled.span`
  display: flex;
  gap: 8px;
  font-size: 11px;
`;

const Additions = styled.span`
  color: #4ade80;
`;

const Deletions = styled.span`
  color: #f87171;
`;

const LineCount = styled.span`
  color: #888888;
`;

const HunkContent = styled.div`
  padding: 6px 8px;
  font-family: var(--font-monospace);
  font-size: 11px;
  line-height: 1.4;
  overflow-x: auto;
  background: rgba(0, 0, 0, 0.2);

  /* CSS Grid ensures all diff lines span the same width (width of longest line) */
  display: grid;
  grid-template-columns: minmax(min-content, 1fr);
`;

const CollapsedIndicator = styled.div`
  padding: 8px 12px;
  text-align: center;
  color: #888;
  font-size: 11px;
  font-style: italic;
  cursor: pointer;

  &:hover {
    color: #ccc;
  }
`;

const RenameInfo = styled.div`
  padding: 12px;
  color: #888;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(100, 150, 255, 0.05);

  &::before {
    content: "→";
    font-size: 14px;
    color: #6496ff;
  }
`;

const ReadIndicator = styled.span`
  display: inline-flex;
  align-items: center;
  color: var(--color-read);
  font-size: 14px;
  margin-right: 4px;
`;

const ToggleReadButton = styled.button`
  background: transparent;
  border: 1px solid #3e3e42;
  border-radius: 3px;
  padding: 2px 6px;
  color: #888;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 4px;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    border-color: var(--color-read);
    color: var(--color-read);
  }

  &:active {
    transform: scale(0.95);
  }
`;

export const HunkViewer = React.memo<HunkViewerProps>(
  ({
    hunk,
    hunkId,
    workspaceId,
    isSelected,
    isRead = false,
    onClick,
    onToggleRead,
    onReviewNote,
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

    // Persist manual expand/collapse state across remounts per workspace
    // Maps hunkId -> isExpanded for user's manual preferences
    const [expandStateMap, setExpandStateMap] = usePersistedState<Record<string, boolean>>(
      getReviewExpandStateKey(workspaceId),
      {}
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

    const handleToggleExpand = (e: React.MouseEvent) => {
      e.stopPropagation();
      const newExpandState = !isExpanded;
      setIsExpanded(newExpandState);
      // Persist manual expand/collapse choice
      setExpandStateMap((prev) => ({
        ...prev,
        [hunkId]: newExpandState,
      }));
    };

    const handleToggleRead = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      onToggleRead?.(e);
    };

    // Detect pure rename: if renamed and content hasn't changed (zero additions and deletions)
    const isPureRename =
      hunk.changeType === "renamed" && hunk.oldPath && additions === 0 && deletions === 0;

    return (
      <HunkContainer
        isSelected={isSelected ?? false}
        isRead={isRead}
        onClick={onClick}
        role="button"
        tabIndex={0}
        data-hunk-id={hunkId}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            // Cast to MouseEvent-like for onClick handler
            onClick?.(e as unknown as React.MouseEvent<HTMLElement>);
          } else if (e.key === " ") {
            e.preventDefault();
            // Space toggles expand/collapse for non-rename hunks
            if (!isPureRename) {
              handleToggleExpand(e as unknown as React.MouseEvent);
            } else {
              // For renames, Space selects the hunk
              onClick?.(e as unknown as React.MouseEvent<HTMLElement>);
            }
          }
        }}
      >
        <HunkHeader>
          {isRead && (
            <TooltipWrapper inline>
              <ReadIndicator aria-label="Marked as read">✓</ReadIndicator>
              <Tooltip align="center" position="top">
                Marked as read
              </Tooltip>
            </TooltipWrapper>
          )}
          <FilePath>{hunk.filePath}</FilePath>
          <LineInfo>
            {!isPureRename && (
              <LocStats>
                {additions > 0 && <Additions>+{additions}</Additions>}
                {deletions > 0 && <Deletions>-{deletions}</Deletions>}
              </LocStats>
            )}
            <LineCount>
              ({lineCount} {lineCount === 1 ? "line" : "lines"})
            </LineCount>
            {onToggleRead && (
              <TooltipWrapper inline>
                <ToggleReadButton
                  data-hunk-id={hunkId}
                  onClick={handleToggleRead}
                  aria-label="Mark as read (m)"
                >
                  {isRead ? "○" : "◉"}
                </ToggleReadButton>
                <Tooltip align="right" position="top">
                  Mark as read (m)
                </Tooltip>
              </TooltipWrapper>
            )}
          </LineInfo>
        </HunkHeader>

        {isPureRename ? (
          <RenameInfo>
            Renamed from <code>{hunk.oldPath}</code>
          </RenameInfo>
        ) : isExpanded ? (
          <HunkContent>
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
            />
          </HunkContent>
        ) : (
          <CollapsedIndicator onClick={handleToggleExpand}>
            {isRead && "Hunk marked as read. "}Click to expand ({lineCount} lines)
          </CollapsedIndicator>
        )}

        {hasManualState && isExpanded && !isPureRename && (
          <CollapsedIndicator onClick={handleToggleExpand}>
            Click here or press [Space] to collapse
          </CollapsedIndicator>
        )}
      </HunkContainer>
    );
  }
);

HunkViewer.displayName = "HunkViewer";
