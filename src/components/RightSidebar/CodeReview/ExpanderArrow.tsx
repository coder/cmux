/**
 * ExpanderArrow - GitHub-style blue arrow for expanding/collapsing context
 */

import React from "react";
import { cn } from "@/lib/utils";

interface ExpanderArrowProps {
  /** Direction of the arrow */
  direction: "up" | "down";
  /** Is content currently expanded? */
  isExpanded: boolean;
  /** Is expansion/collapse in progress? */
  isLoading: boolean;
  /** Can we expand more in this direction? */
  canExpand: boolean;
  /** Click handler to toggle expansion */
  onClick: (e: React.MouseEvent) => void;
}

export const ExpanderArrow = React.memo<ExpanderArrowProps>(
  ({ direction, isExpanded, isLoading, canExpand, onClick }) => {
    // Always show arrow if expanded (to allow collapsing)
    // Show if can expand and not yet expanded
    if (!isExpanded && !canExpand) {
      return null;
    }

    // Arrow direction:
    // - For "up" arrow: Points up (▲) when collapsed (to expand up), down (▼) when expanded (to collapse)
    // - For "down" arrow: Points down (▼) when collapsed (to expand down), up (▲) when expanded (to collapse)
    const arrow =
      direction === "up"
        ? isExpanded
          ? "▼"
          : "▲" // Up: show ▲ to expand up, ▼ to collapse
        : isExpanded
          ? "▲"
          : "▼"; // Down: show ▼ to expand down, ▲ to collapse

    return (
      <div
        className={cn(
          "block w-full cursor-pointer transition-colors hover:bg-[rgba(0,122,204,0.08)]"
        )}
        onClick={onClick}
        role="button"
        aria-label={`${isExpanded ? "Collapse" : "Expand"} context ${direction}`}
      >
        <div
          className="flex px-2 font-mono whitespace-pre"
          style={{ color: "var(--color-accent)" }}
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
          <span className="pl-2 text-[11px] opacity-0">{isLoading ? "Loading..." : ""}</span>
        </div>
      </div>
    );
  }
);

ExpanderArrow.displayName = "ExpanderArrow";
