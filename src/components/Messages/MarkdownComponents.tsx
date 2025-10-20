import type { ReactNode } from "react";
import React, { useState, useEffect, Suspense, lazy } from "react";
import {
  getShikiHighlighter,
  mapToShikiLang,
  SHIKI_THEME,
} from "@/utils/highlighting/shikiHighlighter";

// Lazy load Mermaid to keep it out of the main bundle
// Dynamic import is intentional for code-splitting
// eslint-disable-next-line no-restricted-syntax
const Mermaid = lazy(() => import("./Mermaid").then((module) => ({ default: module.Mermaid })));

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

interface AnchorProps {
  href?: string;
  children?: ReactNode;
}

interface CodeBlockProps {
  code: string;
  language: string;
}

/**
 * CodeBlock component with async Shiki highlighting
 * Reuses shared highlighter instance from diff rendering
 */
const CodeBlock: React.FC<CodeBlockProps> = ({ code, language }) => {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function highlight() {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const highlighter = await getShikiHighlighter();
        const shikiLang = mapToShikiLang(language);

        // codeToHtml lazy-loads languages automatically
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        const result: string = highlighter.codeToHtml(code, {
          lang: shikiLang,
          theme: SHIKI_THEME,
        });

        if (!cancelled) {
          setHtml(result);
        }
      } catch (error) {
        console.warn(`Failed to highlight code block (${language}):`, error);
        if (!cancelled) {
          setHtml(null);
        }
      }
    }

    void highlight();

    return () => {
      cancelled = true;
    };
  }, [code, language]);

  // Show loading state or fall back to plain code
  if (html === null) {
    return (
      <pre>
        <code>{code}</code>
      </pre>
    );
  }

  // Render highlighted HTML
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
};

// Custom components for markdown rendering
export const markdownComponents = {
  // Pass through pre element - let code component handle the wrapping
  pre: ({ children }: PreProps) => <>{children}</>,

  // Custom anchor to open links externally
  a: ({ href, children }: AnchorProps) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),

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

  // Custom code block renderer with async Shiki highlighting
  code: ({ inline, className, children, node, ...props }: CodeProps) => {
    const match = /language-(\w+)/.exec(className ?? "");
    const language = match ? match[1] : "";

    // Extract text content
    const childString =
      typeof children === "string" ? children : Array.isArray(children) ? children.join("") : "";
    const hasMultipleLines = childString.includes("\n");
    const isInline = inline ?? !hasMultipleLines;

    // Handle mermaid diagrams specially
    if (!isInline && language === "mermaid") {
      return (
        <Suspense fallback={<div style={{ padding: "1rem" }}>Loading diagram...</div>}>
          <Mermaid chart={childString} />
        </Suspense>
      );
    }

    // Code blocks with language - use async Shiki highlighting
    if (!isInline && language) {
      return <CodeBlock code={childString} language={language} />;
    }

    // Code blocks without language (global CSS provides styling)
    if (!isInline) {
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
