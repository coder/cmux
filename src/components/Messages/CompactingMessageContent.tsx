import React, { useRef, useEffect } from "react";
import styled from "@emotion/styled";
import { CompactionBackground } from "./CompactionBackground";

/**
 * Wrapper for compaction streaming content
 * Provides max-height constraint with sticky scroll to bottom
 */

const Container = styled.div`
  position: relative;
  max-height: 300px;
  overflow-y: auto;
  overflow-x: hidden;

  /* Subtle indicator that content is scrollable */
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.1);
    border-radius: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(var(--color-plan-mode-rgb), 0.3);
    border-radius: 4px;

    &:hover {
      background: rgba(var(--color-plan-mode-rgb), 0.5);
    }
  }
`;

const ContentWrapper = styled.div`
  position: relative;
  z-index: 1;
`;

interface CompactingMessageContentProps {
  children: React.ReactNode;
}

export const CompactingMessageContent: React.FC<CompactingMessageContentProps> = ({ children }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom as content streams in
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [children]);

  return (
    <Container ref={containerRef}>
      <CompactionBackground />
      <ContentWrapper>{children}</ContentWrapper>
    </Container>
  );
};
