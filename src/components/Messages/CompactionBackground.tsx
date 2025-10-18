import React from "react";
import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";

/**
 * Animated background for compaction streaming
 * Shimmer effect with moving gradient and particles for dynamic appearance
 */

const shimmer = keyframes`
  0% {
    background-position: -1000px 0;
  }
  100% {
    background-position: 1000px 0;
  }
`;

const gradientMove = keyframes`
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
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

const AnimatedGradient = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    -45deg,
    var(--color-plan-mode-alpha),
    color-mix(in srgb, var(--color-plan-mode) 30%, transparent),
    var(--color-plan-mode-alpha),
    color-mix(in srgb, var(--color-plan-mode) 25%, transparent)
  );
  background-size: 400% 400%;
  animation: ${gradientMove} 8s ease infinite;
  opacity: 0.4;
`;

const ShimmerLayer = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    90deg,
    transparent 0%,
    transparent 40%,
    var(--color-plan-mode-alpha) 50%,
    transparent 60%,
    transparent 100%
  );
  background-size: 1000px 100%;
  animation: ${shimmer} 3s infinite linear;
`;

export const CompactionBackground: React.FC = () => {
  return (
    <Container>
      <AnimatedGradient />
      <ShimmerLayer />
    </Container>
  );
};
