/**
 * DiffRenderer - Shared diff rendering component
 * Used by FileEditToolCall for read-only diff display.
 * ReviewPanel uses SelectableDiffRenderer for interactive line selection.
 */

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { getLanguageFromPath } from "@/utils/git/languageDetector";
import { Tooltip, TooltipWrapper } from "../Tooltip";
import { groupDiffLines } from "@/utils/highlighting/diffChunking";
import { highlightDiffChunk, type HighlightedChunk } from "@/utils/highlighting/highlightDiffChunk";
import {
  highlightSearchMatches,
  type SearchHighlightConfig,
} from "@/utils/highlighting/highlightSearchTerms";
import { useIntersectionHighlight } from "@/hooks/useIntersectionHighlight";

// Shared type for diff line types
export type DiffLineType = "add" | "remove" | "context" | "header";

// Helper function for getting diff line background color
const getDiffLineBackground = (type: DiffLineType): string => {
  switch (type) {
    case "add":
      return "rgba(46, 160, 67, 0.15)";
    case "remove":
      return "rgba(248, 81, 73, 0.15)";
    default:
      return "transparent";
  }
};

// Helper function for getting diff line text color
const getDiffLineColor = (type: DiffLineType): string => {
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
};

// Helper function for getting line content color
const getLineContentColor = (type: DiffLineType): string => {
  switch (type) {
    case "header":
      return "#2196f3";
    case "context":
      return "var(--color-text-secondary)";
    case "add":
    case "remove":
      return "var(--color-text)";
  }
};

// Helper function for computing contrast color for add/remove indicators
const getContrastColor = (type: DiffLineType): string => {
  return type === "add" || type === "remove"
    ? "color-mix(in srgb, var(--color-text-secondary), white 50%)"
    : "var(--color-text-secondary)";
};

/**
 * Container component for diff rendering - exported for custom diff displays
 * Used by FileEditToolCall for wrapping custom diff content
 */
export const DiffContainer: React.FC<
  React.PropsWithChildren<{ fontSize?: string; maxHeight?: string; className?: string }>
> = ({ children, fontSize, maxHeight, className }) => {
  return (
    <div
      className={cn(
        "m-0 py-1.5 bg-code-bg rounded grid overflow-y-auto overflow-x-auto [&_*]:text-[inherit]",
        className
      )}
      style={{
        fontSize: fontSize ?? "12px",
        lineHeight: 1.4,
        maxHeight: maxHeight ?? "400px",
        gridTemplateColumns: "minmax(min-content, 1fr)",
      }}
    >
      {children}
    </div>
  );
};

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
  /** Max height for diff container (default: "400px", use "none" for no limit) */
  maxHeight?: string;
}

/**
 * Hook to lazily pre-process and highlight diff content in chunks
 * Defers highlighting until the diff enters the viewport.
 * Search decorations are applied post-highlight.
 */
function useHighlightedDiff(
  content: string,
  language: string,
  oldStart: number,
  newStart: number
): { chunks: HighlightedChunk[] | null; ref: React.RefObject<HTMLDivElement> } {
  const { result: chunks, ref } = useIntersectionHighlight(
    async () => {
      // Split into lines
      const lines = content.split("\n").filter((line) => line.length > 0);

      // Group into chunks
      const diffChunks = groupDiffLines(lines, oldStart, newStart);

      // Highlight each chunk (without search decorations - those are applied later)
      const highlighted = await Promise.all(
        diffChunks.map((chunk) => highlightDiffChunk(chunk, language))
      );

      return highlighted;
    },
    [content, language, oldStart, newStart]
  );

  return { chunks, ref };
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
  filePath,
  fontSize,
  maxHeight,
}) => {
  // Detect language for syntax highlighting (memoized to prevent repeated detection)
  const language = React.useMemo(
    () => (filePath ? getLanguageFromPath(filePath) : "text"),
    [filePath]
  );

  const { chunks: highlightedChunks, ref } = useHighlightedDiff(
    content,
    language,
    oldStart,
    newStart
  );

  // Normalize data structure for rendering (highlighted or plain)
  const normalizedLines = useMemo(() => {
    if (highlightedChunks) {
      // Use highlighted chunks
      return highlightedChunks.flatMap((chunk) =>
        chunk.lines.map((line) => ({
          key: line.originalIndex,
          type: chunk.type,
          lineNumber: line.lineNumber,
          indicator: chunk.type === "add" ? "+" : chunk.type === "remove" ? "-" : " ",
          content: line.html,
          isHighlighted: true,
        }))
      );
    } else {
      // Fallback to plain lines
      return content.split("\n").map((line, idx) => {
        const type = (line.startsWith("+")
          ? "add"
          : line.startsWith("-")
            ? "remove"
            : line.startsWith("@@")
              ? "header"
              : "context") as DiffLineType;
        return {
          key: idx,
          type,
          lineNumber: idx + 1,
          indicator: line.charAt(0),
          content: line.substring(1),
          isHighlighted: false,
        };
      });
    }
  }, [highlightedChunks, content]);

  return (
    <div
      ref={ref}
      className="bg-code-bg m-0 grid overflow-auto rounded py-1.5 [&_*]:text-[inherit]"
      style={{
        fontSize: fontSize ?? "12px",
        lineHeight: 1.4,
        maxHeight: maxHeight ?? "400px",
        gridTemplateColumns: "minmax(min-content, 1fr)",
      }}
    >
      {normalizedLines.map((line) => (
        <div
          key={line.key}
          className="block w-full"
          style={{ background: getDiffLineBackground(line.type) }}
        >
          <div
            className="flex px-2 font-mono whitespace-pre"
            style={{ color: getDiffLineColor(line.type) }}
          >
            <span
              className="inline-block w-1 shrink-0 text-center"
              style={{
                color: getContrastColor(line.type),
                opacity: line.type === "add" || line.type === "remove" ? 0.9 : 0.6,
              }}
            >
              {line.indicator}
            </span>
            {showLineNumbers && (
              <span
                className="flex min-w-9 shrink-0 items-center justify-end pr-1 select-none"
                style={{
                  color: getContrastColor(line.type),
                  opacity: line.type === "add" || line.type === "remove" ? 0.9 : 0.6,
                }}
              >
                {line.lineNumber}
              </span>
            )}
            <span
              className={cn("pl-2", line.isHighlighted && "[&_span:not(.search-highlight)]:!bg-transparent")}
              style={{ color: getLineContentColor(line.type) }}
            >
              {line.isHighlighted ? (
                <span dangerouslySetInnerHTML={{ __html: line.content }} />
              ) : (
                line.content
              )}
            </span>
          </div>
        </div>
      ))}
    </div>
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
  /** Search highlight configuration (optional) */
  searchConfig?: SearchHighlightConfig;
}

interface LineSelection {
  startIndex: number;
  endIndex: number;
  startLineNum: number;
  endLineNum: number;
}

// CSS class for diff line wrapper - used by arbitrary selector in CommentButton
const SELECTABLE_DIFF_LINE_CLASS = "selectable-diff-line";

// Separate component to prevent re-rendering diff lines on every keystroke
interface ReviewNoteInputProps {
  selection: LineSelection;
  lineData: Array<{ index: number; type: DiffLineType; lineNum: number }>;
  lines: string[]; // Original diff lines with +/- prefix
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
      const allLines = lineData.slice(start, end + 1).map((lineInfo) => {
        const line = lines[lineInfo.index];
        const indicator = line[0]; // +, -, or space
        const content = line.slice(1); // Remove the indicator
        return `${lineInfo.lineNum} ${indicator} ${content}`;
      });

      // Elide middle lines if more than 3 lines selected
      let selectedLines: string;
      if (allLines.length <= 3) {
        selectedLines = allLines.join("\n");
      } else {
        const omittedCount = allLines.length - 2;
        selectedLines = [
          allLines[0],
          `    (${omittedCount} lines omitted)`,
          allLines[allLines.length - 1],
        ].join("\n");
      }

      const reviewNote = `<review>\nRe ${filePath}:${lineRange}\n\`\`\`\n${selectedLines}\n\`\`\`\n> ${noteText.trim()}\n</review>`;
      onSubmit(reviewNote);
    };

    return (
      <div
        className="bg-dark m-0 border-t px-2 py-1.5"
        style={{ borderColor: "hsl(from var(--color-review-accent) h s l / 0.3)" }}
      >
        <textarea
          ref={textareaRef}
          className="bg-dark text-text placeholder:text-muted w-full resize-none overflow-y-hidden rounded-sm border px-2 py-1.5 font-mono text-xs leading-[1.4] focus:border-[hsl(from_var(--color-review-accent)_h_s_l_/_0.6)] focus:outline-none"
          style={{
            minHeight: "calc(12px * 1.4 * 3 + 12px)",
            borderColor: "hsl(from var(--color-review-accent) h s l / 0.4)",
          }}
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
      </div>
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
    maxHeight,
    onReviewNote,
    onLineClick,
    searchConfig,
  }) => {
    const [selection, setSelection] = React.useState<LineSelection | null>(null);

    // Detect language for syntax highlighting (memoized to prevent repeated detection)
    const language = React.useMemo(
      () => (filePath ? getLanguageFromPath(filePath) : "text"),
      [filePath]
    );

    const { chunks: highlightedChunks, ref } = useHighlightedDiff(
      content,
      language,
      oldStart,
      newStart
    );

    // Build lineData from highlighted chunks (memoized to prevent repeated parsing)
    // Note: content field is NOT included - must be extracted from lines array when needed
    const lineData = React.useMemo(() => {
      if (!highlightedChunks) return [];

      const data: Array<{
        index: number;
        type: DiffLineType;
        lineNum: number;
        html: string;
      }> = [];

      highlightedChunks.forEach((chunk) => {
        chunk.lines.forEach((line) => {
          data.push({
            index: line.originalIndex,
            type: chunk.type,
            lineNum: line.lineNumber,
            html: line.html,
          });
        });
      });

      return data;
    }, [highlightedChunks]);

    // Memoize highlighted line data to avoid re-parsing HTML on every render
    // Only recalculate when lineData or searchConfig changes
    const highlightedLineData = React.useMemo(() => {
      if (!searchConfig) return lineData;

      return lineData.map((line) => ({
        ...line,
        html: highlightSearchMatches(line.html, searchConfig),
      }));
    }, [lineData, searchConfig]);

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
    const lines = useMemo(() => content.split("\n").filter((line) => line.length > 0), [content]);

    // Determine if we're using highlighted or plain mode
    const useHighlighted = highlightedLineData.length > 0;

    return (
      <div
        ref={ref}
        className="bg-code-bg m-0 grid overflow-auto rounded py-1.5 [&_*]:text-[inherit]"
        style={{
          fontSize: fontSize ?? "12px",
          lineHeight: 1.4,
          maxHeight: maxHeight ?? "400px",
          gridTemplateColumns: "minmax(min-content, 1fr)",
        }}
      >
        {(useHighlighted ? highlightedLineData : lines).map((item, displayIndex) => {
          // Normalize data structure
          const lineInfo: { type: DiffLineType; lineNum: number; html: string } = useHighlighted
            ? (item as (typeof highlightedLineData)[number])
            : {
                type: ((item as string).startsWith("+")
                  ? "add"
                  : (item as string).startsWith("-")
                    ? "remove"
                    : (item as string).startsWith("@@")
                      ? "header"
                      : "context") as DiffLineType,
                lineNum: displayIndex + 1,
                html: (item as string).substring(1), // Plain content without +/- prefix
              };

          const isSelected = isLineSelected(displayIndex);
          const indicator = lineInfo.type === "add" ? "+" : lineInfo.type === "remove" ? "-" : " ";

          return (
            <React.Fragment key={displayIndex}>
              <div
                className={cn(
                  SELECTABLE_DIFF_LINE_CLASS,
                  "block w-full relative cursor-text group"
                )}
                style={{
                  background: isSelected
                    ? "hsl(from var(--color-review-accent) h s l / 0.2)"
                    : getDiffLineBackground(lineInfo.type),
                }}
              >
                <span className="absolute top-1/2 left-1 z-[1] -translate-y-1/2">
                  <TooltipWrapper inline>
                    <button
                      className="bg-review-accent flex h-3.5 w-3.5 shrink-0 cursor-pointer items-center justify-center rounded-sm border-none p-0 font-bold text-white opacity-0 transition-opacity duration-150 group-hover:opacity-70 hover:!opacity-100 active:scale-90"
                      style={{
                        background: "var(--color-review-accent)",
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCommentButtonClick(displayIndex, e.shiftKey);
                      }}
                      onMouseEnter={(e) => {
                        const target = e.currentTarget;
                        target.style.background =
                          "hsl(from var(--color-review-accent) h s calc(l * 1.2))";
                      }}
                      onMouseLeave={(e) => {
                        const target = e.currentTarget;
                        target.style.background = "var(--color-review-accent)";
                      }}
                      aria-label="Add review comment"
                    >
                      +
                    </button>
                    <Tooltip position="bottom" align="left">
                      Add review comment
                      <br />
                      (Shift-click to select range)
                    </Tooltip>
                  </TooltipWrapper>
                </span>
                <div
                  className="flex px-2 font-mono whitespace-pre"
                  style={{ color: getDiffLineColor(lineInfo.type) }}
                >
                  <span
                    className="inline-block w-1 shrink-0 text-center"
                    style={{
                      color: getContrastColor(lineInfo.type),
                      opacity: lineInfo.type === "add" || lineInfo.type === "remove" ? 0.9 : 0.6,
                    }}
                  >
                    {indicator}
                  </span>
                  {showLineNumbers && (
                    <span
                      className="flex min-w-9 shrink-0 items-center justify-end pr-1 select-none"
                      style={{
                        color: getContrastColor(lineInfo.type),
                        opacity: lineInfo.type === "add" || lineInfo.type === "remove" ? 0.9 : 0.6,
                      }}
                    >
                      {lineInfo.lineNum}
                    </span>
                  )}
                  <span
                    className={cn("pl-2", useHighlighted && "[&_span:not(.search-highlight)]:!bg-transparent")}
                    style={{ color: getLineContentColor(lineInfo.type) }}
                  >
                    {useHighlighted ? (
                      <span dangerouslySetInnerHTML={{ __html: lineInfo.html }} />
                    ) : (
                      lineInfo.html
                    )}
                  </span>
                </div>
              </div>

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
      </div>
    );
  }
);

SelectableDiffRenderer.displayName = "SelectableDiffRenderer";
