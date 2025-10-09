import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import type { PluggableList } from "unified";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import "katex/dist/katex.min.css";
import { normalizeMarkdown } from "./MarkdownStyles";
import { markdownComponents } from "./MarkdownComponents";

interface MarkdownCoreProps {
  content: string;
  children?: React.ReactNode; // For cursor or other additions
}

// Plugin arrays are defined at module scope to maintain stable references.
// ReactMarkdown treats new array references as changes requiring full re-parse.
const REMARK_PLUGINS = [remarkGfm, remarkMath];

// Sanitization schema: whitelist only safe HTML elements
// This prevents XSS attacks while allowing <details>/<summary> toggles
const SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    "details",
    "summary",
  ],
  attributes: {
    ...defaultSchema.attributes,
    details: ["open"], // Allow 'open' attribute for default-expanded state
  },
};

const REHYPE_PLUGINS: PluggableList = [
  rehypeRaw, // Parse HTML elements
  [rehypeSanitize, SANITIZE_SCHEMA], // Sanitize to whitelist only
  rehypeKatex, // Render math (must be after sanitization)
];

/**
 * Core markdown rendering component that handles all markdown processing.
 * This is the single source of truth for markdown configuration.
 *
 * Memoized to prevent expensive re-parsing when content hasn't changed.
 */
export const MarkdownCore = React.memo<MarkdownCoreProps>(({ content, children }) => {
  // Memoize the normalized content to avoid recalculating on every render
  const normalizedContent = useMemo(() => normalizeMarkdown(content), [content]);

  return (
    <>
      <ReactMarkdown
        components={markdownComponents}
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
      >
        {normalizedContent}
      </ReactMarkdown>
      {children}
    </>
  );
});

MarkdownCore.displayName = "MarkdownCore";
