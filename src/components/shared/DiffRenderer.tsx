/**
 * DiffRenderer - Shared diff rendering component
 * Used by both FileEditToolCall and ReviewPanel to ensure consistent styling
 */

import React from "react";
import styled from "@emotion/styled";

// Shared type for diff line types
export type DiffLineType = "add" | "remove" | "context" | "header";

// Helper function for computing contrast color for add/remove indicators
const getContrastColor = (type: DiffLineType) => {
  return type === "add" || type === "remove"
    ? "color-mix(in srgb, var(--color-text-secondary), white 50%)"
    : "var(--color-text-secondary)";
};

// Wrapper to ensure background extends full width
export const DiffLineWrapper = styled.div<{ type: DiffLineType }>`
  background: ${({ type }) => {
    switch (type) {
      case "add":
        return "rgba(46, 160, 67, 0.15)";
      case "remove":
        return "rgba(248, 81, 73, 0.15)";
      default:
        return "transparent";
    }
  }};
  width: 100%; /* Always full width so background extends */
  min-width: fit-content; /* But grow if content is wider */
`;

export const DiffLine = styled.div<{ type: DiffLineType }>`
  font-family: var(--font-monospace);
  white-space: pre;
  display: flex;
  padding: ${({ type }) => (type === "header" ? "4px 8px" : "0 8px")};
  color: ${({ type }) => {
    switch (type) {
      case "add":
        return "#4caf50";
      case "remove":
        return "#f44336";
      case "header":
        return "#2196f3";
      case "context":
      default:
        return "var(--color-text)";
    }
  }};
`;

export const LineNumber = styled.span<{ type: DiffLineType }>`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 35px;
  padding-right: 4px;
  font-size: ${({ type }) => (type === "header" ? "14px" : "inherit")};
  font-weight: ${({ type }) => (type === "header" ? "bold" : "normal")};
  color: ${({ type }) => getContrastColor(type)};
  opacity: ${({ type }) => (type === "add" || type === "remove" ? 0.9 : 0.6)};
  user-select: none;
  flex-shrink: 0;
  background: ${({ type }) => {
    switch (type) {
      case "add":
        return "rgba(46, 160, 67, 0.3)";
      case "remove":
        return "rgba(248, 81, 73, 0.3)";
      default:
        return "transparent";
    }
  }};
`;

export const LineContent = styled.span<{ type: DiffLineType }>`
  padding-left: 8px;
  color: ${({ type }) => {
    switch (type) {
      case "header":
        return "#2196f3";
      case "context":
        return "var(--color-text-secondary)";
      case "add":
      case "remove":
        return "var(--color-text)";
    }
  }};
`;

export const DiffIndicator = styled.span<{ type: DiffLineType }>`
  display: inline-block;
  width: 4px;
  text-align: center;
  color: ${({ type }) => getContrastColor(type)};
  opacity: ${({ type }) => (type === "add" || type === "remove" ? 0.9 : 0.6)};
  flex-shrink: 0;
  background: ${({ type }) => {
    switch (type) {
      case "add":
        return "rgba(46, 160, 67, 0.3)";
      case "remove":
        return "rgba(248, 81, 73, 0.3)";
      default:
        return "transparent";
    }
  }};
`;

export const DiffContainer = styled.div`
  margin: 0;
  padding: 6px 0; /* Remove horizontal padding to allow full-width backgrounds */
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
  font-size: 11px;
  line-height: 1.4;
  max-height: 400px;
  overflow-y: auto;
  overflow-x: auto;
  
  /* Wrapper for lines to enable proper scrolling with full-width backgrounds */
  & > * {
    display: block;
  }
`;

interface DiffRendererProps {
  /** Raw diff content with +/- prefixes */
  content: string;
  /** Whether to show line numbers (default: true) */
  showLineNumbers?: boolean;
  /** Starting old line number for context */
  oldStart?: number;
  /** Starting new line number for context */
  newStart?: number;
}

/**
 * DiffRenderer - Renders diff content with consistent styling
 * 
 * Expects content with standard diff format:
 * - Lines starting with '+' are additions (green)
 * - Lines starting with '-' are removals (red)
 * - Lines starting with ' ' or anything else are context
 * - Lines starting with '@@' are headers (blue)
 */
export const DiffRenderer: React.FC<DiffRendererProps> = ({
  content,
  showLineNumbers = true,
  oldStart = 1,
  newStart = 1,
}) => {
  const lines = content.split("\n").filter((line) => line.length > 0);
  
  let oldLineNum = oldStart;
  let newLineNum = newStart;

  return (
    <>
      {lines.map((line, index) => {
        const firstChar = line[0];
        const lineContent = line.slice(1); // Remove the +/-/@ prefix
        let type: DiffLineType = "context";
        let lineNumDisplay = "";

        // Detect header lines (@@) - parse for line numbers but don't render
        if (line.startsWith("@@")) {
          // Parse hunk header for line numbers
          const regex = /^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/;
          const match = regex.exec(line);
          if (match) {
            oldLineNum = parseInt(match[1], 10);
            newLineNum = parseInt(match[2], 10);
          }
          // Don't render the header - it cuts off file names
          return null;
        }

        if (firstChar === "+") {
          type = "add";
          lineNumDisplay = `${newLineNum}`;
          newLineNum++;
        } else if (firstChar === "-") {
          type = "remove";
          lineNumDisplay = `${oldLineNum}`;
          oldLineNum++;
        } else {
          // Context line
          lineNumDisplay = `${oldLineNum}`;
          oldLineNum++;
          newLineNum++;
        }

        return (
          <DiffLineWrapper key={index} type={type}>
            <DiffLine type={type}>
              <DiffIndicator type={type}>{firstChar}</DiffIndicator>
              {showLineNumbers && <LineNumber type={type}>{lineNumDisplay}</LineNumber>}
              <LineContent type={type}>{lineContent}</LineContent>
            </DiffLine>
          </DiffLineWrapper>
        );
      })}
    </>
  );
};

