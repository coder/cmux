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
          "border-border-light block w-full px-2 py-1",
          direction === "up" ? "border-b" : "border-t"
        )}
        style={{
          background: "transparent",
        }}
      >
        <button
          onClick={onClick}
          disabled={isLoading}
          className={cn(
            "flex w-full items-center font-mono whitespace-pre text-[11px]",
            "disabled:cursor-wait hover:bg-[hsl(from_var(--color-accent)_h_s_l_/_0.1)]",
            "transition-colors"
          )}
          style={{
            color: "var(--color-accent)",
          }}
          aria-label={`${isExpanded ? "Collapse" : "Expand"} context ${direction}`}
        >
          {/* Indicator column (like +/- in diff) */}
          <span className="inline-block w-1 shrink-0 text-center opacity-60">·</span>

          {/* Line number column */}
          <span className="flex min-w-9 shrink-0 items-center justify-center">
            {isLoading ? (
              <span className="text-muted text-[9px]">...</span>
            ) : (
              <span className="text-sm leading-none">{arrow}</span>
            )}
          </span>

          {/* Content area */}
          <span className="pl-2 text-[11px] opacity-70">
            {isLoading ? "Loading..." : isExpanded ? "" : ""}
          </span>
        </button>
      </div>
    );
  }
);

ExpanderArrow.displayName = "ExpanderArrow";
