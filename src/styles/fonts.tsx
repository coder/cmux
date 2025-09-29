import { Global, css } from "@emotion/react";

/**
 * Global font definitions for the application
 *
 * FONT GUIDELINES:
 * - Use --font-primary for all UI text, buttons, labels, etc.
 * - Use --font-monospace for code, JSON, raw content, file paths, etc.
 * - These fonts are optimized for cross-platform compatibility and readability
 */
export const GlobalFonts = () => (
  <Global
    styles={css`
      :root {
        /* Primary UI Font - System fonts for best native appearance */
        --font-primary:
          -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial,
          sans-serif;

        /* Monospace Font - Code and technical content */
        --font-monospace: "Monaco", "Menlo", "Ubuntu Mono", "Consolas", "Courier New", monospace;
      }
    `}
  />
);
