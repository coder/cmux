/**
 * Shared syntax highlighting styles for code blocks and diffs
 * Based on VS Code's Dark+ theme, with backgrounds removed for flexibility
 */

import type { CSSProperties } from "react";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

/**
 * Syntax style with colors only (backgrounds removed)
 * This allows us to apply syntax highlighting on top of diff backgrounds
 */
export const syntaxStyleNoBackgrounds: Record<string, CSSProperties> = {};

// Strip background colors from the theme while preserving syntax colors
for (const [key, value] of Object.entries(vscDarkPlus as Record<string, unknown>)) {
  if (typeof value === "object" && value !== null) {
    const { background, backgroundColor, ...rest } = value as Record<string, unknown>;
    syntaxStyleNoBackgrounds[key] = rest as CSSProperties;
  }
}
