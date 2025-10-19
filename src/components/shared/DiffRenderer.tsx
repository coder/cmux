/**
 * DiffRenderer - Shared diff rendering component
 * Used by FileEditToolCall for read-only diff display.
 * ReviewPanel uses SelectableDiffRenderer for interactive line selection.
 */

import React from "react";
import styled from "@emotion/styled";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { syntaxStyleNoBackgrounds } from "@/styles/syntaxHighlighting";
import { getLanguageFromPath } from "@/utils/git/languageDetector";
import { Tooltip, TooltipWrapper } from "../Tooltip";

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

export const DiffContainer = styled.div<{ fontSize?: string }>`
  margin: 0;
  padding: 6px 0;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
  font-size: ${({ fontSize }) => fontSize ?? "12px"};
  line-height: 1.4;
  max-height: 400px;
  overflow-y: auto;
  overflow-x: auto;

  /* CSS Grid ensures all lines span the same width (width of longest line) */
  display: grid;
  grid-template-columns: minmax(min-content, 1fr);

  /* Ensure all child elements inherit font size from container */
  * {
    font-size: inherit;
  }
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
  /** File path for language detection (optional, enables syntax highlighting) */
  filePath?: string;
  /** Font size for diff content (default: "12px") */
  fontSize?: string;
}

/**
 * Highlighted code content - wraps syntax highlighted tokens
 * This component applies syntax highlighting while preserving diff styling
 */
const HighlightedContent = React.memo<{ code: string; language: string }>(
  ({ code, language }) => {
    // Don't highlight if language is unknown
    if (language === "text") {
      return <>{code}</>;
    }

    return (
      <SyntaxHighlighter
        language={language}
        style={syntaxStyleNoBackgrounds}
        PreTag="span"
        CodeTag="span"
        customStyle={{
          display: "inline",
          padding: 0,
          margin: 0,
          background: "transparent",
          fontSize: "inherit",
        }}
        codeTagProps={{
          style: {
            display: "inline",
            fontFamily: "inherit",
            fontSize: "inherit",
          },
        }}
      >
        {code}
      </SyntaxHighlighter>
    );
  }
);

HighlightedContent.displayName = "HighlightedContent";

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
  filePath,
  fontSize,
}) => {
  const lines = content.split("\n").filter((line) => line.length > 0);

  // Detect language for syntax highlighting (memoized to prevent repeated detection)
  const language = React.useMemo(
    () => (filePath ? getLanguageFromPath(filePath) : "text"),
    [filePath]
  );

  let oldLineNum = oldStart;
  let newLineNum = newStart;

  return (
    <DiffContainer fontSize={fontSize}>
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
              <LineContent type={type}>
                <HighlightedContent code={lineContent} language={language} />
              </LineContent>
            </DiffLine>
          </DiffLineWrapper>
        );
      })}
    </DiffContainer>
  );
};

// Selectable version of DiffRenderer for Code Review
interface SelectableDiffRendererProps extends Omit<DiffRendererProps, "filePath"> {
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

// Wrapper for CommentButton tooltip - doesn't interfere with absolute positioning
const CommentButtonWrapper = styled.span`
  position: absolute;
  left: 4px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1;
`;

const CommentButton = styled.button`
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
  color: white;
  font-weight: bold;
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
    transform: scale(0.9);
  }
`;

const InlineNoteContainer = styled.div`
  padding: 6px 8px;
  background: #1e1e1e;
  border-top: 1px solid hsl(from var(--color-review-accent) h s l / 0.3);
  margin: 0;
`;

const NoteTextarea = styled.textarea`
  width: 100%;
  min-height: calc(12px * 1.4 * 3 + 12px); /* 3 lines + padding */
  padding: 6px 8px;
  font-family: var(--font-monospace);
  font-size: 12px;
  line-height: 1.4;
  background: #1e1e1e;
  border: 1px solid hsl(from var(--color-review-accent) h s l / 0.4);
  border-radius: 2px;
  color: var(--color-text);
  resize: none; /* Disable manual resize since we auto-grow */
  overflow-y: hidden; /* Hide scrollbar during auto-grow */

  &:focus {
    outline: none;
    border-color: hsl(from var(--color-review-accent) h s l / 0.6);
  }

  &::placeholder {
    color: #888;
  }
`;

// Separate component to prevent re-rendering diff lines on every keystroke
interface ReviewNoteInputProps {
  selection: LineSelection;
  lineData: Array<{ index: number; type: DiffLineType; lineNum: number; content: string }>;
  lines: string[];
  filePath: string;
  onSubmit: (note: string) => void;
  onCancel: () => void;
}

const ReviewNoteInput: React.FC<ReviewNoteInputProps> = React.memo(
  ({ selection, lineData, lines, filePath, onSubmit, onCancel }) => {
    const [noteText, setNoteText] = React.useState("");
    const textareaRef = React.useRef<HTMLTextAreaElement>(null);

    // Auto-focus on mount
    React.useEffect(() => {
      textareaRef.current?.focus();
    }, []);

    // Auto-expand textarea as user types
    React.useEffect(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      textarea.style.height = "auto";
      textarea.style.height = `${textarea.scrollHeight}px`;
    }, [noteText]);

    const handleSubmit = () => {
      if (!noteText.trim()) return;

      const lineRange =
        selection.startLineNum === selection.endLineNum
          ? `${selection.startLineNum}`
          : `${selection.startLineNum}-${selection.endLineNum}`;

      const [start, end] = [selection.startIndex, selection.endIndex].sort((a, b) => a - b);
      const selectedLines = lineData
        .slice(start, end + 1)
        .map((lineInfo) => {
          const indicator = lines[lineInfo.index][0];
          const content = lineInfo.content;
          return `${lineInfo.lineNum} ${indicator} ${content}`;
        })
        .join("\n");

      const reviewNote = `<review>\nRe ${filePath}:${lineRange}\n\`\`\`\n${selectedLines}\n\`\`\`\n> ${noteText.trim()}\n</review>`;
      onSubmit(reviewNote);
    };

    return (
      <InlineNoteContainer>
        <NoteTextarea
          ref={textareaRef}
          placeholder="Add a review note to chat (Shift-click + button to select range, Enter to submit, Shift+Enter for newline, Esc to cancel)&#10;j, k to iterate through hunks, m to toggle as read"
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            e.stopPropagation();

            if (e.key === "Enter") {
              if (e.shiftKey) {
                // Shift+Enter: allow newline (default behavior)
                return;
              }
              // Enter: submit
              e.preventDefault();
              handleSubmit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
        />
      </InlineNoteContainer>
    );
  }
);

ReviewNoteInput.displayName = "ReviewNoteInput";

export const SelectableDiffRenderer = React.memo<SelectableDiffRendererProps>(
  ({
    content,
    showLineNumbers = true,
    oldStart = 1,
    newStart = 1,
    filePath,
    fontSize,
    onReviewNote,
    onLineClick,
  }) => {
  const [selection, setSelection] = React.useState<LineSelection | null>(null);

  // Detect language for syntax highlighting (memoized to prevent repeated detection)
  const language = React.useMemo(
    () => (filePath ? getLanguageFromPath(filePath) : "text"),
    [filePath]
  );

  // Parse lines to get line numbers (memoized to prevent repeated parsing)
  const lineData = React.useMemo(() => {
    const lines = content.split("\n").filter((line) => line.length > 0);
    const data: Array<{
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

      data.push({
        index,
        type,
        lineNum,
        content: line.slice(1),
      });
    });

    return data;
  }, [content, oldStart, newStart]);

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

  const handleSubmitNote = (reviewNote: string) => {
    if (!onReviewNote) return;
    onReviewNote(reviewNote);
    setSelection(null);
  };

  const handleCancelNote = () => {
    setSelection(null);
  };

  const isLineSelected = (index: number) => {
    if (!selection) return false;
    const [start, end] = [selection.startIndex, selection.endIndex].sort((a, b) => a - b);
    return index >= start && index <= end;
  };

  // Extract lines for rendering (done once, outside map)
  const lines = content.split("\n").filter((line) => line.length > 0);

  return (
    <DiffContainer fontSize={fontSize}>
      {lineData.map((lineInfo, displayIndex) => {
        const isSelected = isLineSelected(displayIndex);

        return (
          <React.Fragment key={displayIndex}>
            <SelectableDiffLineWrapper type={lineInfo.type} isSelected={isSelected}>
              <CommentButtonWrapper>
                <TooltipWrapper inline>
                  <CommentButton
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCommentButtonClick(displayIndex, e.shiftKey);
                    }}
                    aria-label="Add review comment"
                  >
                    +
                  </CommentButton>
                  <Tooltip position="bottom" align="left">
                    Add review comment (Shift-click to select range)
                  </Tooltip>
                </TooltipWrapper>
              </CommentButtonWrapper>
              <DiffLine type={lineInfo.type}>
                <DiffIndicator type={lineInfo.type}>{lines[lineInfo.index][0]}</DiffIndicator>
                {showLineNumbers && (
                  <LineNumber type={lineInfo.type}>{lineInfo.lineNum}</LineNumber>
                )}
                <LineContent type={lineInfo.type}>
                  <HighlightedContent code={lineInfo.content} language={language} />
                </LineContent>
              </DiffLine>
            </SelectableDiffLineWrapper>

            {/* Show textarea after the last selected line */}
            {isSelected &&
              selection &&
              displayIndex === Math.max(selection.startIndex, selection.endIndex) && (
                <ReviewNoteInput
                  selection={selection}
                  lineData={lineData}
                  lines={lines}
                  filePath={filePath}
                  onSubmit={handleSubmitNote}
                  onCancel={handleCancelNote}
                />
              )}
          </React.Fragment>
        );
      })}
    </DiffContainer>
  );
  }
);

SelectableDiffRenderer.displayName = "SelectableDiffRenderer";
