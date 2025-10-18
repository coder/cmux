import React from "react";
import { TooltipWrapper, Tooltip } from "../../Tooltip";

interface ToolIconProps {
  emoji: string;
  toolName: string;
}

/**
 * Shared component for displaying tool emoji with tooltip showing the full tool name.
 * Used consistently across all tool components in ToolHeader.
 */
export const ToolIcon: React.FC<ToolIconProps> = ({ emoji, toolName }) => {
  return (
    <TooltipWrapper inline>
      <span>{emoji}</span>
      <Tooltip>{toolName}</Tooltip>
    </TooltipWrapper>
  );
};

