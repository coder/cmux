import React from 'react';

// Custom components for markdown rendering
export const markdownComponents = {
  // Custom code block renderer
  code: ({ node, inline, className, children, ...props }: any) => {
    const match = /language-(\w+)/.exec(className || "");
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