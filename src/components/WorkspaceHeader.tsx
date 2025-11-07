import React, { useCallback } from "react";
import { AgentStatusIndicator } from "./AgentStatusIndicator";
import { GitStatusIndicator } from "./GitStatusIndicator";
import { RuntimeBadge } from "./RuntimeBadge";
import { TooltipWrapper, Tooltip } from "./Tooltip";
import { formatKeybind, KEYBINDS } from "@/utils/ui/keybinds";
import { useGitStatus } from "@/stores/GitStatusStore";
import type { RuntimeConfig } from "@/types/runtime";

interface WorkspaceHeaderProps {
  workspaceId: string;
  projectName: string;
  branch: string;
  namedWorkspacePath: string;
  runtimeConfig?: RuntimeConfig;
  onOpenRightSidebar?: () => void;
}

export const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  workspaceId,
  projectName,
  branch,
  namedWorkspacePath,
  runtimeConfig,
  onOpenRightSidebar,
}) => {
  const gitStatus = useGitStatus(workspaceId);
  const handleOpenTerminal = useCallback(() => {
    void window.api.workspace.openTerminal(namedWorkspacePath);
  }, [namedWorkspacePath]);

  return (
    <div className="bg-separator border-border-light flex items-center justify-between border-b px-[15px] py-1 [@media(max-width:768px)]:flex-wrap [@media(max-width:768px)]:gap-2 [@media(max-width:768px)]:py-2 [@media(max-width:768px)]:pl-[60px]">
      <div className="text-foreground flex min-w-0 items-center gap-2 overflow-hidden font-semibold">
        <AgentStatusIndicator workspaceId={workspaceId} />
        <GitStatusIndicator
          gitStatus={gitStatus}
          workspaceId={workspaceId}
          tooltipPosition="bottom"
        />
        <RuntimeBadge runtimeConfig={runtimeConfig} />
        <span className="min-w-0 truncate font-mono text-xs">
          {projectName} / {branch}
        </span>
        <span className="text-muted min-w-0 truncate font-mono text-[11px] font-normal">
          {namedWorkspacePath}
        </span>
        <TooltipWrapper inline>
          <button
            onClick={handleOpenTerminal}
            className="text-muted hover:text-foreground flex cursor-pointer items-center justify-center border-none bg-transparent p-1 transition-colors [&_svg]:h-4 [&_svg]:w-4"
          >
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0114.25 15H1.75A1.75 1.75 0 010 13.25V2.75zm1.75-.25a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V2.75a.25.25 0 00-.25-.25H1.75zM7.25 8a.75.75 0 01-.22.53l-2.25 2.25a.75.75 0 01-1.06-1.06L5.44 8 3.72 6.28a.75.75 0 111.06-1.06l2.25 2.25c.141.14.22.331.22.53zm1.5 1.5a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3z" />
            </svg>
          </button>
          <Tooltip className="tooltip" position="bottom" align="center">
            Open in terminal ({formatKeybind(KEYBINDS.OPEN_TERMINAL)})
          </Tooltip>
        </TooltipWrapper>

        {/* Open sidebar button - only visible on mobile */}
        {onOpenRightSidebar && (
          <TooltipWrapper inline>
            <button
              onClick={onOpenRightSidebar}
              className="text-muted hover:text-foreground hidden cursor-pointer items-center justify-center border-none bg-transparent p-1 transition-colors max-md:flex [&_svg]:h-4 [&_svg]:w-4"
              aria-label="Open costs and review panel"
            >
              <svg viewBox="0 0 16 16" fill="currentColor">
                <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0114.25 16H1.75A1.75 1.75 0 010 14.25V1.75zm1.75-.25a.25.25 0 00-.25.25v12.5c0 .138.112.25.25.25H9.5v-13H1.75zm12.5 13H11v-13h3.25a.25.25 0 01.25.25v12.5a.25.25 0 01-.25.25z" />
              </svg>
            </button>
            <Tooltip className="tooltip" position="bottom" align="center">
              Open review panel
            </Tooltip>
          </TooltipWrapper>
        )}
      </div>
    </div>
  );
};
