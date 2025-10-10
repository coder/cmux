import type { ReactNode } from "react";
import type { CSSProperties } from "react";
import React from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Mermaid } from "./Mermaid";

// Create style with colors only (no backgrounds)
const syntaxStyleNoBackgrounds: Record<string, CSSProperties> = {};
for (const [key, value] of Object.entries(vscDarkPlus as Record<string, unknown>)) {
  if (typeof value === "object" && value !== null) {
    const { background, backgroundColor, ...rest } = value as Record<string, unknown>;
    syntaxStyleNoBackgrounds[key] = rest as CSSProperties;
  }
}

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
        margin: "1em 0",
        padding: "0.25em 0.5em",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: "4px",
        background: "rgba(0, 0, 0, 0.2)",
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

  // Custom code block renderer with syntax highlighting
  code: ({ inline, className, children, node, ...props }: CodeProps) => {
    const match = /language-(\w+)/.exec(className ?? "");
    const language = match ? match[1] : "";

    // Better inline detection: check for multiline content
    const childString =
      typeof children === "string" ? children : Array.isArray(children) ? children.join("") : "";
    const hasMultipleLines = childString.includes("\n");
    const isInline = inline ?? !hasMultipleLines;

    if (!isInline && language) {
      // Extract text content from children (react-markdown passes string or array of strings)
      const code =
        typeof children === "string" ? children : Array.isArray(children) ? children.join("") : "";

      // Handle mermaid diagrams
      if (language === "mermaid") {
        return <Mermaid chart={code} />;
      }

      // Code block with language - use syntax highlighter
      return (
        <SyntaxHighlighter
          style={syntaxStyleNoBackgrounds}
          language={language}
          PreTag="pre"
          customStyle={{
            background: "rgba(0, 0, 0, 0.3)",
            margin: "1em 0",
            borderRadius: "4px",
            fontSize: "12px",
            padding: "12px",
          }}
        >
          {code.replace(/\n$/, "")}
        </SyntaxHighlighter>
      );
    }

    if (!isInline) {
      // Code block without language - plain pre/code
      return (
        <pre>
          <code className={className} {...props}>
            {children}
          </code>
        </pre>
      );
    }

    // Inline code (filter out node prop to avoid [object Object])
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};
