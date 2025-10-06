import React from "react";
import styled from "@emotion/styled";

const Indicator = styled.div<{ streaming?: boolean; size?: number }>`
  width: ${(props) => props.size ?? 8}px;
  height: ${(props) => props.size ?? 8}px;
  border-radius: 50%;
  background: ${(props) => (props.streaming ? "var(--color-assistant-border)" : "#6e6e6e")};
  flex-shrink: 0;
  transition: background 0.2s ease;
`;

interface StatusIndicatorProps {
  streaming: boolean;
  size?: number;
  className?: string;
  title?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  streaming,
  size,
  className,
  title,
}) => {
  return <Indicator streaming={streaming} size={size} className={className} title={title} />;
};
