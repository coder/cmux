import React from "react";
import type { StatusSetToolArgs, StatusSetToolResult } from "@/types/tools";
import { ToolContainer, ToolHeader, StatusIndicator } from "./shared/ToolPrimitives";
import { getStatusDisplay, type ToolStatus } from "./shared/toolUtils";
import { TooltipWrapper, Tooltip } from "../Tooltip";

interface StatusSetToolCallProps {
  args: StatusSetToolArgs;
  result?: StatusSetToolResult;
  status?: ToolStatus;
}

export const StatusSetToolCall: React.FC<StatusSetToolCallProps> = ({
  args,
  result: _result,
  status = "pending",
}) => {
  const statusDisplay = getStatusDisplay(status);

  return (
    <ToolContainer expanded={false}>
      <ToolHeader>
        <TooltipWrapper inline>
          <span>{args.emoji}</span>
          <Tooltip>status_set</Tooltip>
        </TooltipWrapper>
        <span className="text-muted-foreground">{args.message}</span>
        <StatusIndicator status={status}>{statusDisplay}</StatusIndicator>
      </ToolHeader>
    </ToolContainer>
  );
};
