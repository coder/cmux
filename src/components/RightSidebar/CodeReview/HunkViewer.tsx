/**
 * HunkViewer - Displays a single diff hunk with syntax highlighting
 */

import React, { useState } from "react";
import styled from "@emotion/styled";
import type { DiffHunk, HunkReview } from "@/types/review";
import { DiffRenderer } from "../../shared/DiffRenderer";

interface HunkViewerProps {
  hunk: DiffHunk;
  review?: HunkReview;
  isSelected?: boolean;
  onClick?: () => void;
  children?: React.ReactNode; // For ReviewActions
}

const HunkContainer = styled.div<{ isSelected: boolean; reviewStatus?: string }>`
  background: #1e1e1e;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  margin-bottom: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s ease;

  ${(props) =>
    props.isSelected &&
    `
    border-color: #007acc;
    box-shadow: 0 0 0 1px #007acc;
  `}

  ${(props) => {
    if (props.reviewStatus === "accepted") {
      return `border-left: 3px solid #4ec9b0;`;
    } else if (props.reviewStatus === "rejected") {
      return `border-left: 3px solid #f48771;`;
    }
    return "";
  }}

  &:hover {
    border-color: #007acc;
  }
`;

const HunkHeader = styled.div`
  background: #252526;
  padding: 8px 12px;
  border-bottom: 1px solid #3e3e42;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--font-monospace);
  font-size: 12px;
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

const NoteSection = styled.div`
  background: #2d2d2d;
  border-top: 1px solid #3e3e42;
  padding: 8px 12px;
  color: #888;
  font-size: 11px;
  font-style: italic;
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

export const HunkViewer: React.FC<HunkViewerProps> = ({ hunk, review, isSelected, onClick, children }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  // Parse diff lines
  const diffLines = hunk.content.split("\n").filter((line) => line.length > 0);
  const lineCount = diffLines.length;
  const shouldCollapse = lineCount > 20; // Collapse hunks with more than 20 lines
  
  // Calculate net LoC (additions - deletions)
  const additions = diffLines.filter((line) => line.startsWith("+")).length;
  const deletions = diffLines.filter((line) => line.startsWith("-")).length;
  
  // Detect pure rename: if renamed and content hasn't changed (all lines match)
  const isPureRename = hunk.changeType === "renamed" && hunk.oldPath && additions === deletions;

  return (
    <HunkContainer
      isSelected={isSelected ?? false}
      reviewStatus={review?.status}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      <HunkHeader>
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
        </LineInfo>
      </HunkHeader>

      {isPureRename ? (
        <RenameInfo>
          Renamed from <code>{hunk.oldPath}</code>
        </RenameInfo>
      ) : isExpanded ? (
        <HunkContent>
          <DiffRenderer content={hunk.content} />
        </HunkContent>
      ) : (
        <CollapsedIndicator onClick={handleToggleExpand}>
          Click to expand ({lineCount} lines)
        </CollapsedIndicator>
      )}

      {shouldCollapse && isExpanded && !isPureRename && (
        <CollapsedIndicator onClick={handleToggleExpand}>Click to collapse</CollapsedIndicator>
      )}

      {children}

      {review?.note && <NoteSection>Note: {review.note}</NoteSection>}
    </HunkContainer>
  );
};

