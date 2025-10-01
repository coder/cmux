import React from "react";
import styled from "@emotion/styled";

const BarrierContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  margin: 4px 0;
  opacity: 0.6;
`;

const BarrierLine = styled.div`
  flex: 1;
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    var(--color-warning, #f59e0b) 20%,
    var(--color-warning, #f59e0b) 80%,
    transparent
  );
  opacity: 0.3;
`;

const BarrierText = styled.div`
  font-family: var(--font-monospace);
  font-size: 10px;
  color: var(--color-warning, #f59e0b);
  text-transform: uppercase;
  letter-spacing: 1px;
  white-space: nowrap;
`;

interface InterruptedBarrierProps {
  className?: string;
}

export const InterruptedBarrier: React.FC<InterruptedBarrierProps> = ({ className }) => {
  return (
    <BarrierContainer className={className}>
      <BarrierLine />
      <BarrierText>interrupted</BarrierText>
      <BarrierLine />
    </BarrierContainer>
  );
};
