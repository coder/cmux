import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { normalizeMarkdown } from "./MarkdownStyles";
import { markdownComponents } from "./MarkdownComponents";

interface MarkdownCoreProps {
  content: string;
  children?: React.ReactNode; // For cursor or other additions
}

/**
 * Core markdown rendering component that handles all markdown processing.
 * This is the single source of truth for markdown configuration.
 */
export const MarkdownCore: React.FC<MarkdownCoreProps> = ({ content, children }) => {
  // Memoize the normalized content to avoid recalculating on every render
  const normalizedContent = useMemo(() => normalizeMarkdown(content), [content]);

  return (
    <>
      <ReactMarkdown components={markdownComponents} remarkPlugins={[remarkGfm]}>
        {normalizedContent}
      </ReactMarkdown>
      {children}
    </>
  );
};
