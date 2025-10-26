import React from "react";
import { cn } from "@/lib/utils";
import type { RuntimeConfig } from "@/types/runtime";
import { extractSshHostname } from "@/utils/ui/runtimeBadge";
import { TooltipWrapper, Tooltip } from "./Tooltip";

interface RuntimeBadgeProps {
  runtimeConfig?: RuntimeConfig;
  className?: string;
}

/**
 * Badge to display SSH runtime information.
 * Shows compute icon + hostname for SSH runtimes, nothing for local.
 */
export function RuntimeBadge({ runtimeConfig, className }: RuntimeBadgeProps) {
  const hostname = extractSshHostname(runtimeConfig);

  if (!hostname) {
    return null;
  }

  return (
    <TooltipWrapper inline>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium",
          "bg-accent/10 text-accent border border-accent/30",
          className
        )}
      >
        <span className="text-[10px]" aria-label="SSH Runtime">
          🖥️
        </span>
        <span className="truncate">{hostname}</span>
      </span>
      <Tooltip align="right">
        Running on SSH host: {runtimeConfig?.type === "ssh" ? runtimeConfig.host : hostname}
      </Tooltip>
    </TooltipWrapper>
  );
}
