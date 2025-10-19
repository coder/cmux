/**
 * HunkViewer - Displays a single diff hunk with syntax highlighting
 */

import React, { useState } from "react";
import styled from "@emotion/styled";
import type { DiffHunk } from "@/types/review";
import { SelectableDiffRenderer } from "../../shared/DiffRenderer";

interface HunkViewerProps {
  hunk: DiffHunk;
  isSelected?: boolean;
  isRead?: boolean;
  onClick?: () => void;
  onToggleRead?: () => void;
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
    border-color: var(--color-plan-mode);
  `}

  ${(props) =>
    props.isSelected &&
    `
    border-color: #007acc;
    box-shadow: 0 0 0 1px #007acc;
  `}

  &:hover {
    border-color: #007acc;
  }
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
  color: var(--color-plan-mode);
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
    border-color: var(--color-plan-mode);
    color: var(--color-plan-mode);
  }

  &:active {
    transform: scale(0.95);
  }
`;

export const HunkViewer: React.FC<HunkViewerProps> = ({
  hunk,
  isSelected,
  isRead = false,
  onClick,
  onToggleRead,
  onReviewNote,
}) => {
  // Collapse by default if marked as read
  const [isExpanded, setIsExpanded] = useState(!isRead);

  // Auto-collapse when marked as read, auto-expand when unmarked
  React.useEffect(() => {
    setIsExpanded(!isRead);
  }, [isRead]);

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  const handleToggleRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleRead?.();
  };

  // Parse diff lines
  const diffLines = hunk.content.split("\n").filter((line) => line.length > 0);
  const lineCount = diffLines.length;
  const shouldCollapse = lineCount > 20; // Collapse hunks with more than 20 lines

  // Calculate net LoC (additions - deletions)
  const additions = diffLines.filter((line) => line.startsWith("+")).length;
  const deletions = diffLines.filter((line) => line.startsWith("-")).length;

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
      data-hunk-id={hunk.id}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <HunkHeader>
        {isRead && <ReadIndicator title="Marked as read">✓</ReadIndicator>}
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
            <ToggleReadButton onClick={handleToggleRead} title="Mark as read (m)">
              {isRead ? "○" : "◉"}
            </ToggleReadButton>
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
            onReviewNote={onReviewNote}
          />
        </HunkContent>
      ) : (
        <CollapsedIndicator onClick={handleToggleExpand}>
          {isRead && "Hunk marked as read. "}Click to expand ({lineCount} lines)
        </CollapsedIndicator>
      )}

      {shouldCollapse && isExpanded && !isPureRename && (
        <CollapsedIndicator onClick={handleToggleExpand}>Click to collapse</CollapsedIndicator>
      )}
    </HunkContainer>
  );
};
