/**
 * HunkHeader - Header section of a diff hunk showing file path, stats, and controls
 */

import React from "react";
import { Tooltip, TooltipWrapper } from "../../Tooltip";
import { KEYBINDS, formatKeybind } from "@/utils/ui/keybinds";

interface HunkHeaderProps {
  /** File path (may contain HTML from search highlighting) */
  highlightedFilePath: string;
  /** Whether the hunk is marked as read */
  isRead: boolean;
  /** Number of additions in the hunk */
  additions: number;
  /** Number of deletions in the hunk */
  deletions: number;
  /** Total line count */
  lineCount: number;
  /** Whether this is a pure rename (no content changes) */
  isPureRename: boolean;
  /** Hunk ID for event handling */
  hunkId: string;
  /** Callback when toggle read button is clicked */
  onToggleRead?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

export const HunkHeader = React.memo<HunkHeaderProps>(
  ({
    highlightedFilePath,
    isRead,
    additions,
    deletions,
    lineCount,
    isPureRename,
    hunkId,
    onToggleRead,
  }) => {
    return (
      <div className="bg-separator border-border-light font-monospace flex items-center justify-between gap-2 border-b px-3 py-2 text-xs">
        {isRead && (
          <TooltipWrapper inline>
            <span
              className="text-read mr-1 inline-flex items-center text-sm"
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
          className="text-foreground min-w-0 truncate font-medium"
          dangerouslySetInnerHTML={{ __html: highlightedFilePath }}
        />
        <div className="flex shrink-0 items-center gap-2 text-[11px] whitespace-nowrap">
          {!isPureRename && (
            <span className="flex gap-2 text-[11px]">
              {additions > 0 && <span className="text-success-light">+{additions}</span>}
              {deletions > 0 && <span className="text-warning-light">-{deletions}</span>}
            </span>
          )}
          <span className="text-muted">
            ({lineCount} {lineCount === 1 ? "line" : "lines"})
          </span>
          {onToggleRead && (
            <TooltipWrapper inline>
              <button
                className="border-border-light text-muted hover:border-read hover:text-read flex cursor-pointer items-center gap-1 rounded-[3px] border bg-transparent px-1.5 py-0.5 text-[11px] transition-all duration-200 hover:bg-white/5 active:scale-95"
                data-hunk-id={hunkId}
                onClick={onToggleRead}
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
    );
  }
);

HunkHeader.displayName = "HunkHeader";
