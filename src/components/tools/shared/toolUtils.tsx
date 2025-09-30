import React, { useState } from "react";
import { LoadingDots } from "./ToolPrimitives";

/**
 * Shared utilities and hooks for tool components
 */

export type ToolStatus = "pending" | "executing" | "completed" | "failed";

/**
 * Hook for managing tool expansion state
 */
export function useToolExpansion(initialExpanded = false) {
  const [expanded, setExpanded] = useState(initialExpanded);
  const toggleExpanded = () => setExpanded(!expanded);
  return { expanded, setExpanded, toggleExpanded };
}

/**
 * Get display element for tool status
 */
export function getStatusDisplay(status: ToolStatus): React.ReactNode {
  switch (status) {
    case "executing":
      return (
        <>
          <LoadingDots /> executing
        </>
      );
    case "completed":
      return "✓ completed";
    case "failed":
      return "✗ failed";
    default:
      return "pending";
  }
}

/**
 * Format a value for display (JSON or string)
 */
export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "None";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
