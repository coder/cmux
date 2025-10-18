import React from "react";
import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";

/**
 * Animated background for compaction streaming
 * Multi-layered gradient wave with subtle glow for polished appearance
 */

const sweep = keyframes`
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(200%);
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
  width: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--color-plan-mode-alpha) 20%,
    color-mix(in srgb, var(--color-plan-mode) 20%, transparent) 40%,
    color-mix(in srgb, var(--color-plan-mode) 25%, transparent) 50%,
    color-mix(in srgb, var(--color-plan-mode) 20%, transparent) 60%,
    var(--color-plan-mode-alpha) 80%,
    transparent 100%
  );
  animation: ${sweep} 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  filter: blur(1px);
`;

const HighlightWave = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    transparent 35%,
    var(--color-plan-mode-alpha-hover) 50%,
    transparent 65%,
    transparent 100%
  );
  animation: ${sweep} 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
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
