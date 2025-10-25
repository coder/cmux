/**
 * ReadMoreButton - Button for expanding/collapsing context in code review hunks
 */

import React from "react";

interface ReadMoreButtonProps {
  /** Direction of expansion/collapse */
  direction: "up" | "down";
  /** Action type */
  action: "expand" | "collapse";
  /** Number of lines that will be added/removed */
  numLines: number;
  /** Whether the button is in loading state */
  isLoading: boolean;
  /** Whether the button is disabled (e.g., at file boundary) */
  disabled?: boolean;
  /** Click handler */
  onClick: (e: React.MouseEvent) => void;
}

export const ReadMoreButton = React.memo<ReadMoreButtonProps>(
  ({ direction, action, numLines, isLoading, disabled = false, onClick }) => {
    const arrow = direction === "up" ? "↑" : "↓";
    const verb = action === "expand" ? "Read" : "Show";
    const qualifier = action === "expand" ? "more" : "fewer";

    const label = isLoading ? "Loading..." : `${verb} ${numLines} ${qualifier} lines ${arrow}`;

    return (
      <div className="border-border-light border-b px-2 py-1.5">
        <button
          onClick={onClick}
          disabled={isLoading || disabled}
          className="text-muted hover:text-foreground disabled:text-muted w-full text-center text-[11px] italic disabled:cursor-not-allowed"
        >
          {label}
        </button>
      </div>
    );
  }
);

ReadMoreButton.displayName = "ReadMoreButton";
