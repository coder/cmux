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

const float = keyframes`
  0%, 100% {
    transform: translateY(0) translateX(0);
    opacity: 0.4;
  }
  25% {
    transform: translateY(-10px) translateX(5px);
    opacity: 0.7;
  }
  50% {
    transform: translateY(-15px) translateX(-5px);
    opacity: 0.5;
  }
  75% {
    transform: translateY(-8px) translateX(3px);
    opacity: 0.6;
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
    rgba(255, 255, 255, 0.15) 50%,
    transparent 60%,
    transparent 100%
  );
  background-size: 1000px 100%;
  animation: ${shimmer} 3s infinite linear;
`;

const Particle = styled.div<{ delay: number; duration: number; left: string; size: number }>`
  position: absolute;
  left: ${(props) => props.left};
  bottom: 20%;
  width: ${(props) => props.size}px;
  height: ${(props) => props.size}px;
  background: var(--color-plan-mode);
  border-radius: 50%;
  opacity: 0.3;
  animation: ${float} ${(props) => props.duration}s ease-in-out infinite;
  animation-delay: ${(props) => props.delay}s;
  filter: blur(2px);
`;

export const CompactionBackground: React.FC = () => {
  // Generate particles with different properties for organic feel
  const particles = [
    { delay: 0, duration: 4, left: "10%", size: 4 },
    { delay: 0.5, duration: 5, left: "25%", size: 6 },
    { delay: 1, duration: 4.5, left: "45%", size: 3 },
    { delay: 1.5, duration: 5.5, left: "60%", size: 5 },
    { delay: 0.8, duration: 4.8, left: "75%", size: 4 },
    { delay: 2, duration: 5.2, left: "85%", size: 3 },
    { delay: 0.3, duration: 5, left: "35%", size: 5 },
    { delay: 1.8, duration: 4.3, left: "55%", size: 4 },
  ];

  return (
    <Container>
      <AnimatedGradient />
      <ShimmerLayer />
      {particles.map((particle, index) => (
        <Particle
          key={index}
          delay={particle.delay}
          duration={particle.duration}
          left={particle.left}
          size={particle.size}
        />
      ))}
    </Container>
  );
};
