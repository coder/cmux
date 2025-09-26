import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import styled from "@emotion/styled";
import { markdownStyles, normalizeMarkdown } from "./MarkdownStyles";
import { markdownComponents } from "./MarkdownComponents";

const MarkdownContainer = styled.div`
  ${markdownStyles}
`;

const ControlsContainer = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--color-border);
`;

const ControlButton = styled.button`
  background: var(--color-button-bg);
  border: 1px solid var(--color-border);
  color: var(--color-button-text);
  padding: 4px 10px;
  border-radius: 3px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: inherit;

  &:hover {
    background: var(--color-button-hover-bg);
    color: var(--color-text);
  }

  &:active {
    transform: scale(0.98);
  }
`;

const RawContent = styled.pre`
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 12px;
  line-height: 1.4;
  color: var(--color-text);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  padding: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 3px;
`;

const ContentWrapper = styled.div``;


interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className,
}) => {
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const normalizedContent = normalizeMarkdown(content);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <ContentWrapper className={className}>
      {showRaw ? (
        <RawContent>{content}</RawContent>
      ) : (
        <MarkdownContainer>
          <ReactMarkdown components={markdownComponents}>
            {normalizedContent}
          </ReactMarkdown>
        </MarkdownContainer>
      )}
      <ControlsContainer>
        <ControlButton onClick={handleCopy}>
          {copied ? "✓ Copied" : "Copy"}
        </ControlButton>
        <ControlButton onClick={() => setShowRaw(!showRaw)}>
          {showRaw ? "Show Formatted" : "Show Raw"}
        </ControlButton>
      </ControlsContainer>
    </ContentWrapper>
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
  const [showRaw, setShowRaw] = useState(false);
  const [copied, setCopied] = useState(false);
  const normalizedContent = normalizeMarkdown(content);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <ContentWrapper className={className}>
      {showRaw ? (
        <RawContent>{content}</RawContent>
      ) : (
        <PlanMarkdownContainer>
          <ReactMarkdown components={markdownComponents}>
            {normalizedContent}
          </ReactMarkdown>
        </PlanMarkdownContainer>
      )}
      <ControlsContainer>
        <ControlButton onClick={handleCopy}>
          {copied ? "✓ Copied" : "Copy"}
        </ControlButton>
        <ControlButton onClick={() => setShowRaw(!showRaw)}>
          {showRaw ? "Show Formatted" : "Show Raw"}
        </ControlButton>
      </ControlsContainer>
    </ContentWrapper>
  );
};
