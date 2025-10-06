import React, { useMemo } from "react";
import styled from "@emotion/styled";
import { markdownStyles } from "../Messages/MarkdownStyles";
import { MarkdownCore } from "./MarkdownCore";
import { StreamingContext } from "./StreamingContext";

const MarkdownContainer = styled.div`
  ${markdownStyles}
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

  const streamingContextValue = useMemo(() => ({ isStreaming }), [isStreaming]);

  return (
    <StreamingContext.Provider value={streamingContextValue}>
      <MarkdownContainer className={className}>
        <MarkdownCore content={content} />
      </MarkdownContainer>
    </StreamingContext.Provider>
  );
});
