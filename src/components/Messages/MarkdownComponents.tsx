import type { ReactNode } from "react";
import React from "react";
import { Mermaid } from "./Mermaid";

interface CodeProps {
  node?: unknown;
  inline?: boolean;
  className?: string;
  children?: ReactNode;
}

interface PreProps {
  children?: ReactNode;
}

interface DetailsProps {
  children?: ReactNode;
  open?: boolean;
}

interface SummaryProps {
  children?: ReactNode;
}

// Custom components for markdown rendering
export const markdownComponents = {
  // Pass through pre element - let code component handle the wrapping
  pre: ({ children }: PreProps) => <>{children}</>,

  // Custom details/summary for collapsible sections
  details: ({ children, open }: DetailsProps) => (
    <details
      open={open}
      style={{
        margin: "0.5em 0",
        padding: "0.25em 0.5em",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "4px",
        background: "var(--color-code-bg)",
      }}
    >
      {children}
    </details>
  ),

  summary: ({ children }: SummaryProps) => (
    <summary
      style={{
        cursor: "pointer",
        fontWeight: 600,
        padding: "0.25em 0",
        userSelect: "none",
      }}
    >
      <span style={{ marginLeft: "0.35em" }}>{children}</span>
    </summary>
  ),

  // Custom code block renderer
  // Shiki rehype handles syntax highlighting for code blocks
  code: ({ inline, className, children, node, ...props }: CodeProps) => {
    const match = /language-(\w+)/.exec(className ?? "");
    const language = match ? match[1] : "";

    // Better inline detection: check for multiline content
    const childString =
      typeof children === "string" ? children : Array.isArray(children) ? children.join("") : "";
    const hasMultipleLines = childString.includes("\n");
    const isInline = inline ?? !hasMultipleLines;

    if (!isInline && language === "mermaid") {
      // Handle mermaid diagrams specially
      const code =
        typeof children === "string" ? children : Array.isArray(children) ? children.join("") : "";
      return <Mermaid chart={code} />;
    }

    // For all other code blocks and inline code, let Shiki/default rendering handle it
    // Inline code (filter out node prop to avoid [object Object])
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};
