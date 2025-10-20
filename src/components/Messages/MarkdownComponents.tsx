import type { ReactNode } from "react";
import React, { useState, useEffect } from "react";
import { Mermaid } from "./Mermaid";
import { getShikiHighlighter, mapToShikiLang, SHIKI_THEME } from "@/utils/highlighting/shikiHighlighter";

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
        const highlighter = await getShikiHighlighter();
        const shikiLang = mapToShikiLang(language);

        // Load language on-demand if needed
        const loadedLangs = highlighter.getLoadedLanguages();
        if (!loadedLangs.includes(shikiLang)) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
            await highlighter.loadLanguage(shikiLang as any);
          } catch {
            // Language not available - fall back to plain code
            if (!cancelled) {
              setHtml(null);
            }
            return;
          }
        }

        const result = highlighter.codeToHtml(code, {
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
      <pre
        style={{
          background: "var(--color-code-bg)",
          margin: "1em 0",
          borderRadius: "4px",
          fontSize: "12px",
          padding: "12px",
          overflow: "auto",
        }}
      >
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
      return <Mermaid chart={childString} />;
    }

    // Code blocks with language - use async Shiki highlighting
    if (!isInline && language) {
      return <CodeBlock code={childString} language={language} />;
    }

    // Code blocks without language
    if (!isInline) {
      return (
        <pre
          style={{
            background: "var(--color-code-bg)",
            margin: "1em 0",
            borderRadius: "4px",
            fontSize: "12px",
            padding: "12px",
            overflow: "auto",
          }}
        >
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
