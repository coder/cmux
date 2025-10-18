import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";

/**
 * Animated background for compaction streaming
 * Isolated component for visual effect during compaction
 */

const shimmer = keyframes`
  0% {
    background-position: -200% center;
  }
  100% {
    background-position: 200% center;
  }
`;

export const CompactionBackground = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(var(--color-plan-mode-rgb), 0.08) 25%,
    rgba(var(--color-plan-mode-rgb), 0.15) 50%,
    rgba(var(--color-plan-mode-rgb), 0.08) 75%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: ${shimmer} 3s ease-in-out infinite;
  pointer-events: none;
  border-radius: 6px;
`;
