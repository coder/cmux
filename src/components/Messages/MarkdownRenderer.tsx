import React from "react";
import styled from "@emotion/styled";
import { markdownStyles } from "./MarkdownStyles";
import { MarkdownCore } from "./MarkdownCore";

const MarkdownContainer = styled.div`
  ${markdownStyles}
`;

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
  return (
    <MarkdownContainer className={className}>
      <MarkdownCore content={content} />
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
