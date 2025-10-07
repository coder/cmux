import React from "react";
import styled from "@emotion/styled";

interface BarrierContainerProps {
  animate?: boolean;
}

const BarrierContainer = styled.div<BarrierContainerProps>`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  margin: 4px 0;
  opacity: ${(props) => (props.animate ? "1" : "0.6")};

  ${(props) =>
    props.animate &&
    `
    animation: pulse 1.5s ease-in-out infinite;

    @keyframes pulse {
      0%,
      100% {
        opacity: 0.6;
      }
      50% {
        opacity: 1;
      }
    }
  `}
`;

interface BarrierLineProps {
  color: string;
}

const BarrierLine = styled.div<BarrierLineProps>`
  flex: 1;
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    ${(props) => props.color} 20%,
    ${(props) => props.color} 80%,
    transparent
  );
  opacity: 0.3;
`;

interface BarrierTextProps {
  color: string;
}

const BarrierText = styled.div<BarrierTextProps>`
  font-family: var(--font-monospace);
  font-size: 10px;
  color: ${(props) => props.color};
  text-transform: uppercase;
  letter-spacing: 1px;
  white-space: nowrap;
`;

interface BaseBarrierProps {
  text: string;
  color: string;
  animate?: boolean;
  className?: string;
}

export const BaseBarrier: React.FC<BaseBarrierProps> = ({
  text,
  color,
  animate = false,
  className,
}) => {
  return (
    <BarrierContainer animate={animate} className={className}>
      <BarrierLine color={color} />
      <BarrierText color={color}>{text}</BarrierText>
      <BarrierLine color={color} />
    </BarrierContainer>
  );
};
