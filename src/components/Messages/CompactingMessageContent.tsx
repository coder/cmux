import React from "react";
import styled from "@emotion/styled";

/**
 * Wrapper for compaction streaming content
 * Provides max-height constraint with fade effect to imply content above
 * No scrolling - content stays anchored to bottom, older content fades at top
 */

const Container = styled.div`
  max-height: 300px;
  overflow: hidden;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end; /* Anchor content to bottom */

  /* Fade effect: content fades progressively from top to bottom */
  mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(0, 0, 0, 0.3) 5%,
    rgba(0, 0, 0, 0.6) 10%,
    rgba(0, 0, 0, 0.85) 15%,
    black 20%
  );
  -webkit-mask-image: linear-gradient(
    to bottom,
    transparent 0%,
    rgba(0, 0, 0, 0.3) 5%,
    rgba(0, 0, 0, 0.6) 10%,
    rgba(0, 0, 0, 0.85) 15%,
    black 20%
  );
`;

interface CompactingMessageContentProps {
  children: React.ReactNode;
}

export const CompactingMessageContent: React.FC<CompactingMessageContentProps> = ({ children }) => {
  return <Container>{children}</Container>;
};
