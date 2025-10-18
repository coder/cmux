/**
 * HunkViewer - Displays a single diff hunk with syntax highlighting
 */

import React, { useState } from "react";
import styled from "@emotion/styled";
import type { DiffHunk, HunkReview } from "@/types/review";
import { DiffRenderer } from "../shared/DiffRenderer";

interface HunkViewerProps {
  hunk: DiffHunk;
  review?: HunkReview;
  isSelected?: boolean;
  onClick?: () => void;
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
`;

const LineInfo = styled.div`
  color: #888888;
  font-size: 11px;
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

export const HunkViewer: React.FC<HunkViewerProps> = ({ hunk, review, isSelected, onClick }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  };

  // Parse diff lines
  const diffLines = hunk.content.split("\n").filter((line) => line.length > 0);
  const lineCount = diffLines.length;
  const shouldCollapse = lineCount > 20; // Collapse hunks with more than 20 lines

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
          {hunk.header} ({lineCount} {lineCount === 1 ? "line" : "lines"})
        </LineInfo>
      </HunkHeader>

      {isExpanded ? (
        <HunkContent>
          <DiffRenderer content={hunk.content} />
        </HunkContent>
      ) : (
        <CollapsedIndicator onClick={handleToggleExpand}>
          Click to expand ({lineCount} lines)
        </CollapsedIndicator>
      )}

      {shouldCollapse && isExpanded && (
        <CollapsedIndicator onClick={handleToggleExpand}>Click to collapse</CollapsedIndicator>
      )}

      {review?.note && <NoteSection>Note: {review.note}</NoteSection>}
    </HunkContainer>
  );
};

