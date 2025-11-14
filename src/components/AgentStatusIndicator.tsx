import React, { useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { TooltipWrapper, Tooltip } from "./Tooltip";
import { canInterrupt, useWorkspaceSidebarState } from "@/stores/WorkspaceStore";
import { getStatusTooltip } from "@/utils/ui/statusTooltip";

interface AgentStatusIndicatorProps {
  workspaceId: string;
  // Sidebar-specific props (optional)
  lastReadTimestamp?: number;
  onClick?: (e: React.MouseEvent) => void;
  // Display props
  size?: number;
  className?: string;
}

export const AgentStatusIndicator: React.FC<AgentStatusIndicatorProps> = ({
  workspaceId,
  lastReadTimestamp,
  onClick,
  size = 8,
  className,
}) => {
  // Get workspace state
  const { interruptType, currentModel, agentStatus, recencyTimestamp } =
    useWorkspaceSidebarState(workspaceId);

  const streaming = canInterrupt(interruptType);

  // Compute unread status if lastReadTimestamp provided (sidebar only)
  const unread = useMemo(() => {
    if (lastReadTimestamp === undefined) return false;
    return recencyTimestamp !== null && recencyTimestamp > lastReadTimestamp;
  }, [lastReadTimestamp, recencyTimestamp]);

  // Compute tooltip
  const title = useMemo(
    () =>
      getStatusTooltip({
        isStreaming: streaming,
        streamingModel: currentModel,
        agentStatus,
        isUnread: unread,
        recencyTimestamp,
      }),
    [streaming, currentModel, agentStatus, unread, recencyTimestamp]
  );

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

  const bgColor = streaming ? "bg-assistant-border" : unread ? "bg-white" : "bg-muted-dark";
  const cursor = onClick && !streaming ? "cursor-pointer" : "cursor-default";

  // Always show dot, add emoji next to it when available
  const dot = (
    <div
      style={{ width: size, height: size }}
      className={cn(
        "rounded-full shrink-0 transition-colors duration-200",
        bgColor,
        cursor,
        onClick && !streaming && "hover:opacity-70"
      )}
      onClick={handleClick}
    />
  );

  const handleEmojiClick = useCallback(
    (e: React.MouseEvent) => {
      if (agentStatus?.url) {
        e.stopPropagation(); // Prevent workspace selection
        window.open(agentStatus.url, "_blank", "noopener,noreferrer");
      }
    },
    [agentStatus?.url]
  );

  const emoji = agentStatus ? (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center transition-all duration-200",
        agentStatus.url && "cursor-pointer hover:opacity-80"
      )}
      style={{
        fontSize: size * 1.5,
        filter: streaming ? "none" : "grayscale(100%)",
        opacity: streaming ? 1 : 0.6,
      }}
      onClick={handleEmojiClick}
      title={agentStatus.url ? "Click to open URL" : undefined}
    >
      {agentStatus.emoji}
    </div>
  ) : null;

  // Container holds both emoji and dot (emoji on left)
  const indicator = (
    <div className={cn("flex items-center gap-1.5", className)} onClick={handleClick}>
      {emoji}
      {dot}
    </div>
  );

  // If tooltip content provided, wrap with proper Tooltip component
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
