import React from "react";
import type { StatusSetToolArgs, StatusSetToolResult } from "@/types/tools";
import {
  ToolContainer,
  ToolHeader,
  ExpandIcon,
  StatusIndicator,
  ToolDetails,
} from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay, type ToolStatus } from "./shared/toolUtils";
import { TooltipWrapper, Tooltip } from "../Tooltip";

interface StatusSetToolCallProps {
  args: StatusSetToolArgs;
  result?: StatusSetToolResult;
  status?: ToolStatus;
}

export const StatusSetToolCall: React.FC<StatusSetToolCallProps> = ({
  args,
  result,
  status = "pending",
}) => {
  const { expanded, toggleExpanded } = useToolExpansion(false); // Collapsed by default
  const statusDisplay = getStatusDisplay(status);

  return (
    <ToolContainer expanded={expanded}>
      <ToolHeader onClick={toggleExpanded}>
        <ExpandIcon expanded={expanded}>▶</ExpandIcon>
        <TooltipWrapper inline>
          <span>{args.emoji}</span>
          <Tooltip>status_set</Tooltip>
        </TooltipWrapper>
        <span className="text-muted-foreground">{args.message}</span>
        <StatusIndicator status={status}>{statusDisplay}</StatusIndicator>
      </ToolHeader>

      {expanded && result && (
        <ToolDetails>
          {result.success ? (
            <div className="text-sm text-muted-foreground">
              Status updated: {result.emoji} {result.message}
            </div>
          ) : (
            <div className="text-sm text-red-400">Error: {result.error}</div>
          )}
        </ToolDetails>
      )}
    </ToolContainer>
  );
};
