import React from "react";
import styled from "@emotion/styled";
import { keyframes } from "@emotion/react";

/**
 * Animated background for compaction streaming
 * Green laser scanning effect - futuristic vertical bar sweeping back and forth
 */

const scan = keyframes`
  0% {
    left: -10%;
  }
  50% {
    left: 110%;
  }
  100% {
    left: -10%;
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

const LaserBar = styled.div`
  position: absolute;
  top: 0;
  bottom: 0;
  width: 80px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(34, 197, 94, 0.05) 20%,
    rgba(34, 197, 94, 0.15) 40%,
    rgba(34, 197, 94, 0.25) 50%,
    rgba(34, 197, 94, 0.15) 60%,
    rgba(34, 197, 94, 0.05) 80%,
    transparent 100%
  );
  box-shadow: 0 0 20px rgba(34, 197, 94, 0.3);
  animation: ${scan} 2.5s ease-in-out infinite;
`;

export const CompactionBackground: React.FC = () => {
  return (
    <Container>
      <LaserBar />
    </Container>
  );
};
