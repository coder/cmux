import React from "react";
import styled from "@emotion/styled";
import { markdownStyles } from "../Messages/MarkdownStyles";
import { MarkdownCore } from "./MarkdownCore";

const MarkdownContainer = styled.div<{ isStreaming: boolean }>`
  ${markdownStyles}

  /* Target the last text node's parent when streaming and add blinking cursor */
  ${(props) =>
    props.isStreaming &&
    `
    p:last-child::after,
    li:last-child::after,
    div:last-child::after,
    span:last-child::after {
      content: "▊";
      margin-left: 0.15em;
      animation: blink 1s step-end infinite;
    }

    @keyframes blink {
      0%, 50% {
        opacity: 1;
      }
      51%, 100% {
        opacity: 0;
      }
    }
  `}
`;

interface TypewriterMarkdownProps {
  deltas: string[];
  isComplete: boolean;
  className?: string;
}

// Use React.memo to prevent unnecessary re-renders from parent
export const TypewriterMarkdown = React.memo<TypewriterMarkdownProps>(function TypewriterMarkdown({
  deltas,
  isComplete,
  className,
}) {
  // Simply join all deltas - no artificial delays or character-by-character rendering
  const content = deltas.join("");

  // Show cursor only when streaming (not complete)
  const isStreaming = !isComplete && content.length > 0;

  return (
    <MarkdownContainer className={className} isStreaming={isStreaming}>
      <MarkdownCore content={content} />
    </MarkdownContainer>
  );
});
