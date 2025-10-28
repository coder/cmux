import React from "react";
import { ModelDisplay } from "@/components/Messages/ModelDisplay";
import { formatRelativeTime } from "@/utils/ui/dateTime";

/**
 * Compute tooltip content for StatusIndicator based on workspace state.
 * Handles both sidebar (with unread/recency) and header (simpler) cases.
 */
export function getStatusTooltip(options: {
  isStreaming: boolean;
  streamingModel: string | null;
  agentStatus?: { emoji: string; message: string };
  isUnread?: boolean;
  recencyTimestamp?: number | null;
}): React.ReactNode {
  const { isStreaming, streamingModel, agentStatus, isUnread, recencyTimestamp } = options;

  // If agent status is set, always show that message
  if (agentStatus) {
    return agentStatus.message;
  }

  // Otherwise show streaming/idle status
  if (isStreaming && streamingModel) {
    return (
      <span>
        <ModelDisplay modelString={streamingModel} showTooltip={false} /> is responding
      </span>
    );
  }

  if (isStreaming) {
    return "Assistant is responding";
  }

  // Only show unread if explicitly provided (sidebar only)
  if (isUnread) {
    return "Unread messages";
  }

  // Show recency if available (sidebar only)
  if (recencyTimestamp) {
    return `Idle • Last used ${formatRelativeTime(recencyTimestamp)}`;
  }

  return "Idle";
}

