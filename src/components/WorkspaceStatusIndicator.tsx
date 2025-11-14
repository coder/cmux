import { useWorkspaceSidebarState } from "@/stores/WorkspaceStore";
import { ExternalLinkIcon } from "lucide-react";
import { memo } from "react";
import { Tooltip, TooltipWrapper } from "./Tooltip";
import { Button } from "./ui/button";

export const WorkspaceStatusIndicator = memo(({ workspaceId }: { workspaceId: string }) => {
  const { agentStatus } = useWorkspaceSidebarState(workspaceId);

  if (!agentStatus) {
    return null;
  }

  return (
    <div className="text-muted flex gap-1.5 items-center text-xs">
      {agentStatus.emoji && (
        // Emojis do not visually center well, so we offset them
        // slightly with negative margin.
        <span className="text-[10px] -mt-0.5">{agentStatus.emoji}</span>
      )}
      {agentStatus.message}
      {agentStatus.url && (
        <TooltipWrapper inline>
          <Button
            variant="ghost"
            size="icon"
            className="h-4 w-4 [&_svg]:size-3 flex items-center justify-center"
          >
            <a href={agentStatus.url} target="_blank" rel="noopener noreferrer">
              <ExternalLinkIcon />
            </a>
          </Button>

          <Tooltip className="tooltip" align="center">
            {agentStatus.url}
          </Tooltip>
        </TooltipWrapper>
      )}
    </div>
  );
});
