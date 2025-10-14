import React, { useCallback } from "react";
import styled from "@emotion/styled";
import { TooltipWrapper, Tooltip } from "./Tooltip";

const Indicator = styled.div<{
  streaming?: boolean;
  unread?: boolean;
  clickable?: boolean;
  size?: number;
}>`
  width: ${(props) => props.size ?? 8}px;
  height: ${(props) => props.size ?? 8}px;
  border-radius: 50%;
  background: ${(props) =>
    props.streaming ? "var(--color-assistant-border)" : props.unread ? "#ffffff" : "#6e6e6e"};
  flex-shrink: 0;
  transition: background 0.2s ease;
  cursor: ${(props) => (props.clickable && !props.streaming ? "pointer" : "default")};

  &:hover {
    ${(props) =>
      props.clickable && !props.streaming
        ? `
      opacity: 0.7;
    `
        : ""}
  }
`;

interface StatusIndicatorProps {
  streaming: boolean;
  unread?: boolean;
  size?: number;
  className?: string;
  title?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
}

const StatusIndicatorInner: React.FC<StatusIndicatorProps> = ({
  streaming,
  unread,
  size,
  className,
  title,
  onClick,
}) => {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Only allow clicking when not streaming
      if (!streaming && onClick) {
        e.stopPropagation(); // Prevent workspace selection
        onClick(e);
      }
    },
    [streaming, onClick]
  );

  const indicator = (
    <Indicator
      streaming={streaming}
      unread={unread}
      clickable={!!onClick}
      size={size}
      className={className}
      onClick={handleClick}
    />
  );

  // If title provided, wrap with proper Tooltip component
  if (title) {
    return (
      <TooltipWrapper inline>
        {indicator}
        <Tooltip className="tooltip" align="center">
          {title}
        </Tooltip>
      </TooltipWrapper>
    );
  }

  return indicator;
};

// Memoize to prevent re-renders when props haven't changed
export const StatusIndicator = React.memo(StatusIndicatorInner);
