/**
 * ExpanderArrow - GitHub-style blue arrow for expanding/collapsing context
 */

import React from "react";
import { cn } from "@/lib/utils";

interface ExpanderArrowProps {
  /** Direction of the arrow */
  direction: "up" | "down";
  /** Mode: expand adds lines, collapse removes lines */
  mode: "expand" | "collapse";
  /** Is expansion/collapse in progress? */
  isLoading: boolean;
  /** Click handler */
  onClick: (e: React.MouseEvent) => void;
  /** Optional marker text to show (e.g., "Beginning of file") */
  markerText?: string;
}

export const ExpanderArrow = React.memo<ExpanderArrowProps>(
  ({ direction, mode, isLoading, onClick, markerText }) => {
    // Arrow symbol based on direction and mode
    // Expand: always points toward direction (▲ for up, ▼ for down)
    // Collapse: always points away from direction (▼ for up, ▲ for down)
    const arrow =
      mode === "expand" ? (direction === "up" ? "▲" : "▼") : direction === "up" ? "▼" : "▲";

    // Collapse arrows are more muted
    const opacity = mode === "collapse" ? 0.5 : 1;

    return (
      <div
        className={cn(
          "block w-full cursor-pointer transition-colors hover:bg-[rgba(0,122,204,0.08)]"
        )}
        onClick={onClick}
        role="button"
        aria-label={`${mode === "expand" ? "Expand" : "Collapse"} context ${direction}`}
      >
        <div
          className="flex px-2 font-mono whitespace-pre"
          style={{ color: "var(--color-accent)", opacity }}
        >
          {/* Indicator column - matches diff line structure */}
          <span className="inline-block w-1 shrink-0 text-center opacity-40">·</span>

          {/* Line number column - matches diff line structure */}
          <span className="flex min-w-9 shrink-0 items-center justify-end pr-1 select-none">
            {isLoading ? (
              <span className="text-[9px] opacity-50">...</span>
            ) : (
              <span className="text-sm leading-none">{arrow}</span>
            )}
          </span>

          {/* Content area - matches diff line structure */}
          {markerText ? (
            <span className="text-muted flex items-center gap-1.5 pl-2 text-[11px] italic">
              <span className="opacity-50">•</span>
              <span>{markerText}</span>
            </span>
          ) : (
            <span className="pl-2 text-[11px] opacity-0">{isLoading ? "Loading..." : ""}</span>
          )}
        </div>
      </div>
    );
  }
);

ExpanderArrow.displayName = "ExpanderArrow";
