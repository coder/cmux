/**
 * ReadMoreButton - Button for expanding context in code review hunks
 */

import React from "react";

interface ReadMoreButtonProps {
  /** Direction of expansion */
  direction: "up" | "down";
  /** Number of lines that will be loaded */
  numLines: number;
  /** Whether the button is in loading state */
  isLoading: boolean;
  /** Whether the button is disabled (e.g., at file boundary) */
  disabled?: boolean;
  /** Click handler */
  onClick: (e: React.MouseEvent) => void;
}

export const ReadMoreButton = React.memo<ReadMoreButtonProps>(
  ({ direction, numLines, isLoading, disabled = false, onClick }) => {
    const arrow = direction === "up" ? "↑" : "↓";
    const label = isLoading ? "Loading..." : `Read ${numLines} more lines ${arrow}`;

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
