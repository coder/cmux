import React from "react";
import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";

/**
 * Animated background for compaction streaming
 * Subtle gradient wave effect that sweeps across the message
 */

const sweep = keyframes`
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(200%);
  }
`;

const Container = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  pointer-events: none;
  border-radius: 6px;
`;

const GradientWave = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--color-plan-mode-alpha-hover) 25%,
    color-mix(in srgb, var(--color-plan-mode) 25%, transparent) 50%,
    var(--color-plan-mode-alpha-hover) 75%,
    transparent 100%
  );
  animation: ${sweep} 3s ease-in-out infinite;
  opacity: 1;
`;

export const CompactionBackground: React.FC = () => {
  return (
    <Container>
      <GradientWave />
    </Container>
  );
};
