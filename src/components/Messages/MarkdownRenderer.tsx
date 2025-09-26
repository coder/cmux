import React from "react";
import ReactMarkdown from "react-markdown";
import styled from "@emotion/styled";
import { markdownStyles, normalizeMarkdown } from "./MarkdownStyles";
import { markdownComponents } from "./MarkdownComponents";

const MarkdownContainer = styled.div`
  ${markdownStyles}
`;



interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className,
}) => {
  const normalizedContent = normalizeMarkdown(content);

  return (
    <MarkdownContainer className={className}>
      <ReactMarkdown components={markdownComponents}>
        {normalizedContent}
      </ReactMarkdown>
    </MarkdownContainer>
  );
};

// For plan-specific styling
export const PlanMarkdownContainer = styled.div`
  ${markdownStyles}
  
  blockquote {
    border-left-color: var(--color-plan-mode);
  }

  code {
    color: var(--color-plan-mode-hover);
  }
`;

interface PlanMarkdownRendererProps {
  content: string;
  className?: string;
}

export const PlanMarkdownRenderer: React.FC<PlanMarkdownRendererProps> = ({
  content,
  className,
}) => {
  const normalizedContent = normalizeMarkdown(content);

  return (
    <PlanMarkdownContainer className={className}>
      <ReactMarkdown components={markdownComponents}>
        {normalizedContent}
      </ReactMarkdown>
    </PlanMarkdownContainer>
  );
};
