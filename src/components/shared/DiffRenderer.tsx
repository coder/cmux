/**
 * DiffRenderer - Shared diff rendering component
 * Used by FileEditToolCall for read-only diff display.
 * ReviewPanel uses SelectableDiffRenderer for interactive line selection.
 */

import React from "react";
import styled from "@emotion/styled";

// Shared type for diff line types
export type DiffLineType = "add" | "remove" | "context" | "header";

// Helper function for computing contrast color for add/remove indicators
const getContrastColor = (type: DiffLineType) => {
  return type === "add" || type === "remove"
    ? "color-mix(in srgb, var(--color-text-secondary), white 50%)"
    : "var(--color-text-secondary)";
};

/**
 * Wrapper for diff lines - works with CSS Grid parent to ensure uniform widths
 *
 * Problem: Lines of varying length created jagged backgrounds during horizontal scroll
 * because each wrapper was only as wide as its content.
 *
 * Solution: Parent container uses CSS Grid, which automatically makes all grid items
 * (these wrappers) the same width as the widest item. This ensures backgrounds span
 * the full scrollable area without creating infinite scroll.
 *
 * Key insight: width: 100% makes each wrapper span the full grid column width,
 * which CSS Grid automatically sets to the widest line's content.
 */
export const DiffLineWrapper = styled.div<{ type: DiffLineType }>`
  display: block;
  width: 100%; /* Span full grid column (width of longest line) */

  background: ${({ type }) => {
    switch (type) {
      case "add":
        return "rgba(46, 160, 67, 0.15)";
      case "remove":
        return "rgba(248, 81, 73, 0.15)";
      default:
        return "transparent";
    }
  }};
`;

export const DiffLine = styled.div<{ type: DiffLineType }>`
  font-family: var(--font-monospace);
  white-space: pre;
  display: flex;
  padding: ${({ type }) => (type === "header" ? "4px 8px" : "0 8px")};
  color: ${({ type }) => {
    switch (type) {
      case "add":
        return "#4caf50";
      case "remove":
        return "#f44336";
      case "header":
        return "#2196f3";
      case "context":
      default:
        return "var(--color-text)";
    }
  }};
`;

export const LineNumber = styled.span<{ type: DiffLineType }>`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 35px;
  padding-right: 4px;
  font-size: ${({ type }) => (type === "header" ? "14px" : "inherit")};
  font-weight: ${({ type }) => (type === "header" ? "bold" : "normal")};
  color: ${({ type }) => getContrastColor(type)};
  opacity: ${({ type }) => (type === "add" || type === "remove" ? 0.9 : 0.6)};
  user-select: none;
  flex-shrink: 0;
`;

export const LineContent = styled.span<{ type: DiffLineType }>`
  padding-left: 8px;
  color: ${({ type }) => {
    switch (type) {
      case "header":
        return "#2196f3";
      case "context":
        return "var(--color-text-secondary)";
      case "add":
      case "remove":
        return "var(--color-text)";
    }
  }};
`;

export const DiffIndicator = styled.span<{ type: DiffLineType }>`
  display: inline-block;
  width: 4px;
  text-align: center;
  color: ${({ type }) => getContrastColor(type)};
  opacity: ${({ type }) => (type === "add" || type === "remove" ? 0.9 : 0.6)};
  flex-shrink: 0;
`;

export const DiffContainer = styled.div`
  margin: 0;
  padding: 6px 0;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
  font-size: 11px;
  line-height: 1.4;
  max-height: 400px;
  overflow-y: auto;
  overflow-x: auto;

  /* CSS Grid ensures all lines span the same width (width of longest line) */
  display: grid;
  grid-template-columns: minmax(min-content, 1fr);
`;

interface DiffRendererProps {
  /** Raw diff content with +/- prefixes */
  content: string;
  /** Whether to show line numbers (default: true) */
  showLineNumbers?: boolean;
  /** Starting old line number for context */
  oldStart?: number;
  /** Starting new line number for context */
  newStart?: number;
}

/**
 * DiffRenderer - Renders diff content with consistent styling
 *
 * Expects content with standard diff format:
 * - Lines starting with '+' are additions (green)
 * - Lines starting with '-' are removals (red)
 * - Lines starting with ' ' or anything else are context
 * - Lines starting with '@@' are headers (blue)
 */
export const DiffRenderer: React.FC<DiffRendererProps> = ({
  content,
  showLineNumbers = true,
  oldStart = 1,
  newStart = 1,
}) => {
  const lines = content.split("\n").filter((line) => line.length > 0);

  let oldLineNum = oldStart;
  let newLineNum = newStart;

  return (
    <>
      {lines.map((line, index) => {
        const firstChar = line[0];
        const lineContent = line.slice(1); // Remove the +/-/@ prefix
        let type: DiffLineType = "context";
        let lineNumDisplay = "";

        // Detect header lines (@@) - parse for line numbers but don't render
        if (line.startsWith("@@")) {
          // Parse hunk header for line numbers
          const regex = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/;
          const match = regex.exec(line);
          if (match) {
            oldLineNum = parseInt(match[1], 10);
            newLineNum = parseInt(match[2], 10);
          }
          // Don't render the header - it cuts off file names
          return null;
        }

        if (firstChar === "+") {
          type = "add";
          lineNumDisplay = `${newLineNum}`;
          newLineNum++;
        } else if (firstChar === "-") {
          type = "remove";
          lineNumDisplay = `${oldLineNum}`;
          oldLineNum++;
        } else {
          // Context line
          lineNumDisplay = `${oldLineNum}`;
          oldLineNum++;
          newLineNum++;
        }

        return (
          <DiffLineWrapper key={index} type={type}>
            <DiffLine type={type}>
              <DiffIndicator type={type}>{firstChar}</DiffIndicator>
              {showLineNumbers && <LineNumber type={type}>{lineNumDisplay}</LineNumber>}
              <LineContent type={type}>{lineContent}</LineContent>
            </DiffLine>
          </DiffLineWrapper>
        );
      })}
    </>
  );
};

// Selectable version of DiffRenderer for Code Review
interface SelectableDiffRendererProps extends DiffRendererProps {
  /** File path for generating review notes */
  filePath: string;
  /** Callback when user submits a review note */
  onReviewNote?: (note: string) => void;
  /** Callback when user clicks on a line (to activate parent hunk) */
  onLineClick?: () => void;
}

interface LineSelection {
  startIndex: number;
  endIndex: number;
  startLineNum: number;
  endLineNum: number;
}

const SelectableDiffLineWrapper = styled(DiffLineWrapper)<{
  type: DiffLineType;
  isSelected: boolean;
}>`
  position: relative;
  cursor: text; /* Allow text selection by default */

  ${({ isSelected }) =>
    isSelected &&
    `
    background: hsl(from var(--color-review-accent) h s l / 0.2) !important;
  `}
`;

const CommentButton = styled.button`
  position: absolute;
  left: 4px;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0; /* Hidden by default */
  background: var(--color-review-accent);
  border: none;
  border-radius: 2px;
  width: 14px;
  height: 14px;
  padding: 0;
  cursor: pointer;
  transition: opacity 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: white;
  font-weight: bold;
  z-index: 1;
  flex-shrink: 0;

  /* Show button on line hover */
  ${SelectableDiffLineWrapper}:hover & {
    opacity: 0.7;
  }

  &:hover {
    opacity: 1 !important;
    background: hsl(from var(--color-review-accent) h s calc(l * 1.2));
  }

  &:active {
    transform: translateY(-50%) scale(0.9);
  }
`;

const InlineNoteContainer = styled.div`
  padding: 10px 8px 8px 8px;
  background: #252526;
  border-top: 1px solid hsl(from var(--color-review-accent) h s l / 0.3);
  margin: 0;
`;

const NoteTextarea = styled.textarea`
  width: 100%;
  min-height: 50px;
  padding: 6px 8px;
  font-family: var(--font-sans);
  font-size: 11px;
  background: #1e1e1e;
  border: 1px solid hsl(from var(--color-review-accent) h s l / 0.4);
  border-radius: 2px;
  color: var(--color-text);
  resize: vertical;

  &:focus {
    outline: none;
    border-color: hsl(from var(--color-review-accent) h s l / 0.6);
  }

  &::placeholder {
    color: #888;
    font-size: 11px;
  }
`;

export const SelectableDiffRenderer: React.FC<SelectableDiffRendererProps> = ({
  content,
  showLineNumbers = true,
  oldStart = 1,
  newStart = 1,
  filePath,
  onReviewNote,
  onLineClick,
}) => {
  const [selection, setSelection] = React.useState<LineSelection | null>(null);
  const [noteText, setNoteText] = React.useState("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const lines = content.split("\n").filter((line) => line.length > 0);

  // Parse lines to get line numbers
  const lineData: Array<{
    index: number;
    type: DiffLineType;
    lineNum: number;
    content: string;
  }> = [];

  let oldLineNum = oldStart;
  let newLineNum = newStart;

  lines.forEach((line, index) => {
    const firstChar = line[0];

    // Skip header lines
    if (line.startsWith("@@")) {
      const regex = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/;
      const match = regex.exec(line);
      if (match) {
        oldLineNum = parseInt(match[1], 10);
        newLineNum = parseInt(match[2], 10);
      }
      return;
    }

    let type: DiffLineType = "context";
    let lineNum = 0;

    if (firstChar === "+") {
      type = "add";
      lineNum = newLineNum++;
    } else if (firstChar === "-") {
      type = "remove";
      lineNum = oldLineNum++;
    } else {
      lineNum = newLineNum;
      oldLineNum++;
      newLineNum++;
    }

    lineData.push({
      index,
      type,
      lineNum,
      content: line.slice(1),
    });
  });

  const handleCommentButtonClick = (lineIndex: number, shiftKey: boolean) => {
    // Notify parent that this hunk should become active
    onLineClick?.();

    // Shift-click: extend existing selection
    if (shiftKey && selection) {
      const start = selection.startIndex;
      const [sortedStart, sortedEnd] = [start, lineIndex].sort((a, b) => a - b);
      setSelection({
        startIndex: start,
        endIndex: lineIndex,
        startLineNum: lineData[sortedStart].lineNum,
        endLineNum: lineData[sortedEnd].lineNum,
      });
      return;
    }

    // Regular click: start new selection
    setSelection({
      startIndex: lineIndex,
      endIndex: lineIndex,
      startLineNum: lineData[lineIndex].lineNum,
      endLineNum: lineData[lineIndex].lineNum,
    });
  };

  const handleSubmitNote = () => {
    if (!noteText.trim() || !selection || !onReviewNote) return;

    const lineRange =
      selection.startLineNum === selection.endLineNum
        ? `${selection.startLineNum}`
        : `${selection.startLineNum}-${selection.endLineNum}`;

    // Extract selected lines with line numbers and +/- indicators
    const [start, end] = [selection.startIndex, selection.endIndex].sort((a, b) => a - b);
    const selectedLines = lineData
      .slice(start, end + 1)
      .map((lineInfo) => {
        const indicator = lines[lineInfo.index][0]; // +, -, or space
        const content = lineInfo.content;
        return `${lineInfo.lineNum} ${indicator} ${content}`;
      })
      .join("\n");

    const reviewNote = `<review>\nRe ${filePath}:${lineRange}\n\`\`\`\n${selectedLines}\n\`\`\`\n> ${noteText.trim()}\n</review>`;

    onReviewNote(reviewNote);

    // Reset state
    setSelection(null);
    setNoteText("");
  };

  const handleCancelNote = () => {
    setSelection(null);
    setNoteText("");
  };

  // Auto-focus textarea when selection is made or changed
  React.useEffect(() => {
    if (selection && textareaRef.current) {
      // Small delay to ensure textarea is rendered
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 0);
    }
  }, [selection]);

  const isLineSelected = (index: number) => {
    if (!selection) return false;
    const [start, end] = [selection.startIndex, selection.endIndex].sort((a, b) => a - b);
    return index >= start && index <= end;
  };

  return (
    <>
      {lineData.map((lineInfo, displayIndex) => {
        const isSelected = isLineSelected(displayIndex);

        return (
          <React.Fragment key={displayIndex}>
            <SelectableDiffLineWrapper type={lineInfo.type} isSelected={isSelected}>
              <CommentButton
                onClick={(e) => {
                  e.stopPropagation();
                  handleCommentButtonClick(displayIndex, e.shiftKey);
                }}
                title="Add review comment (Shift-click to select range)"
                aria-label="Add review comment"
              >
                +
              </CommentButton>
              <DiffLine type={lineInfo.type}>
                <DiffIndicator type={lineInfo.type}>{lines[lineInfo.index][0]}</DiffIndicator>
                {showLineNumbers && (
                  <LineNumber type={lineInfo.type}>{lineInfo.lineNum}</LineNumber>
                )}
                <LineContent type={lineInfo.type}>{lineInfo.content}</LineContent>
              </DiffLine>
            </SelectableDiffLineWrapper>

            {/* Show textarea after the last selected line */}
            {isSelected &&
              selection &&
              displayIndex === Math.max(selection.startIndex, selection.endIndex) && (
                <InlineNoteContainer>
                  <NoteTextarea
                    ref={textareaRef}
                    placeholder="Add a review note to chat (Shift-click + button to select range, Cmd+Enter to submit, Esc to cancel)&#10;j, k to iterate through hunks, m to toggle as read"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      // Stop propagation for all keys to prevent parent handlers
                      e.stopPropagation();

                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleSubmitNote();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        handleCancelNote();
                      }
                    }}
                  />
                </InlineNoteContainer>
              )}
          </React.Fragment>
        );
      })}
    </>
  );
};
