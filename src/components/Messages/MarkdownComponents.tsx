import type { ReactNode } from "react";
import React from "react";

interface CodeProps {
  node?: unknown;
  inline?: boolean;
  className?: string;
  children?: ReactNode;
}

// Custom components for markdown rendering
export const markdownComponents = {
  // Custom code block renderer
  code: ({ inline, className, children, ...props }: CodeProps) => {
    const match = /language-(\w+)/.exec(className ?? "");
    const language = match ? match[1] : "";

    if (!inline && language) {
      return (
        <pre className={className}>
          <code {...props}>{children}</code>
        </pre>
      );
    }

    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
};
