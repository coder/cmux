import { css } from "@emotion/react";

export const markdownStyles = css`
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: var(--color-text);
  white-space: normal;

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    margin: 1.2em 0 0.6em 0;
    font-weight: 600;
    line-height: 1.25;
  }

  h1 {
    font-size: 20px;
  }
  h2 {
    font-size: 18px;
  }
  h3 {
    font-size: 16px;
  }
  h4 {
    font-size: 14px;
  }
  h5,
  h6 {
    font-size: 13px;
  }

  p {
    margin: 0.8em 0;
  }

  /* Remove default margins on first and last elements */
  > *:first-child {
    margin-top: 0;
  }

  > *:last-child {
    margin-bottom: 0;
  }

  ul,
  ol {
    margin: 0.8em 0;
    padding-left: 20px;
  }

  li {
    margin: 0.4em 0;
  }

  code {
    background: rgba(0, 0, 0, 0.2);
    padding: 2px 4px;
    border-radius: 3px;
    font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
    font-size: 12px;
    color: #d19a66;
  }

  pre {
    background: rgba(0, 0, 0, 0.3);
    padding: 12px;
    border-radius: 4px;
    overflow-x: auto;
    margin: 1em 0;

    code {
      background: none;
      padding: 0;
      color: var(--color-text);
    }
  }

  blockquote {
    border-left: 3px solid var(--color-border);
    padding-left: 12px;
    margin: 1em 0;
    color: var(--color-text-secondary);
    font-style: italic;
  }

  strong {
    font-weight: 600;
  }

  em {
    font-style: italic;
  }

  hr {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 1.4em 0;
  }

  a {
    color: #569cd6;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;

    th,
    td {
      border: 1px solid var(--color-border);
      padding: 6px 12px;
      text-align: left;
    }

    th {
      background: rgba(255, 255, 255, 0.05);
      font-weight: 600;
    }

    tr:nth-of-type(even) {
      background: rgba(255, 255, 255, 0.02);
    }
  }

  img {
    max-width: 100%;
    height: auto;
  }

  /* Task lists */
  input[type="checkbox"] {
    margin-right: 6px;
  }

  /* Strikethrough */
  del {
    text-decoration: line-through;
    opacity: 0.6;
  }
`;

// Normalize markdown to remove excess blank lines
export function normalizeMarkdown(content: string): string {
  // Replace 3 or more consecutive newlines with exactly 2 newlines
  return content.replace(/\n{3,}/g, "\n\n");
}
