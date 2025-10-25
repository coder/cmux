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
    // Don't show arrow if we can't expand and nothing is currently expanded
    if (!canExpand && !isExpanded) {
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
    const actionText = isExpanded ? "Collapse" : "Expand";

    return (
      <div
        className={cn(
          "border-border-light flex items-center justify-center px-2 py-1.5 transition-colors",
          direction === "up" ? "border-b" : "border-t"
        )}
      >
        <button
          onClick={onClick}
          disabled={isLoading}
          className={cn(
            "flex items-center gap-2 text-[11px] font-medium transition-all",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "hover:bg-[hsl(from_var(--color-accent)_h_s_l_/_0.15)]",
            "rounded px-2 py-1"
          )}
          style={{
            color: "var(--color-accent)",
          }}
          aria-label={`${actionText} context ${direction}`}
        >
          {/* Line number gutter spacing to align with diff lines */}
          <span className="inline-block w-1" />
          <span className="min-w-9" />

          {isLoading ? (
            <span className="text-muted">Loading...</span>
          ) : (
            <>
              <span className="font-mono text-sm">{arrow}</span>
              <span>{actionText}</span>
            </>
          )}
        </button>
      </div>
    );
  }
);

ExpanderArrow.displayName = "ExpanderArrow";
