import React from "react";
import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";

/**
 * Animated background for compaction streaming
 * Multi-layered gradient wave with subtle glow for polished appearance
 */

const sweep = keyframes`
  0% {
    transform: translateX(-50%);
  }
  100% {
    transform: translateX(100%);
  }
`;

const pulse = keyframes`
  0%, 100% {
    opacity: 0.3;
  }
  50% {
    opacity: 0.5;
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

const BaseGlow = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: radial-gradient(ellipse at center, var(--color-plan-mode-alpha) 0%, transparent 70%);
  animation: ${pulse} 2s ease-in-out infinite;
`;

const GradientWave = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 150%;
  background: linear-gradient(
    90deg,
    var(--color-plan-mode-alpha) 0%,
    color-mix(in srgb, var(--color-plan-mode) 20%, transparent) 20%,
    color-mix(in srgb, var(--color-plan-mode) 25%, transparent) 33%,
    color-mix(in srgb, var(--color-plan-mode) 20%, transparent) 46%,
    var(--color-plan-mode-alpha) 60%,
    transparent 80%,
    transparent 100%
  );
  animation: ${sweep} 4s linear infinite;
  filter: blur(1px);
`;

const HighlightWave = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 150%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    transparent 25%,
    var(--color-plan-mode-alpha-hover) 33%,
    transparent 41%,
    transparent 100%
  );
  animation: ${sweep} 4s linear infinite;
`;

export const CompactionBackground: React.FC = () => {
  return (
    <Container>
      <BaseGlow />
      <GradientWave />
      <HighlightWave />
    </Container>
  );
};
