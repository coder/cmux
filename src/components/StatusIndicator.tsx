import React, { useCallback } from "react";
import { cn } from "@/lib/utils";
import { TooltipWrapper, Tooltip } from "./Tooltip";

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
  size = 8,
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

  const bgColor = streaming ? "bg-assistant-border" : unread ? "bg-white" : "bg-gray-600";

  const cursor = onClick && !streaming ? "cursor-pointer" : "cursor-default";

  const indicator = (
    <div
      style={{ width: size, height: size }}
      className={cn(
        "rounded-full shrink-0 transition-colors duration-200",
        bgColor,
        cursor,
        onClick && !streaming && "hover:opacity-70",
        className
      )}
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
