import React from "react";
import styled from "@emotion/styled";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useWorkspaceUsage } from "@/stores/WorkspaceStore";
import { use1MContext } from "@/hooks/use1MContext";
import { useResizeObserver } from "@/hooks/useResizeObserver";
import { CostsTab } from "./RightSidebar/CostsTab";
import { VerticalTokenMeter } from "./RightSidebar/VerticalTokenMeter";
import { calculateTokenMeterData } from "@/utils/tokens/tokenMeterUtils";

interface SidebarContainerProps {
  collapsed: boolean;
}

const SidebarContainer = styled.div<SidebarContainerProps>`
  width: ${(props) => (props.collapsed ? "20px" : "300px")};
  background: #252526;
  border-left: 1px solid #3e3e42;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width 0.2s ease;
  flex-shrink: 0;

  /* Keep vertical bar always visible when collapsed */
  ${(props) =>
    props.collapsed &&
    `
    position: sticky;
    right: 0;
    z-index: 10;
    box-shadow: -2px 0 4px rgba(0, 0, 0, 0.2);
  `}
`;

const FullView = styled.div<{ visible: boolean }>`
  display: ${(props) => (props.visible ? "flex" : "none")};
  flex-direction: column;
  height: 100%;
`;

const CollapsedView = styled.div<{ visible: boolean }>`
  display: ${(props) => (props.visible ? "flex" : "none")};
  height: 100%;
`;

const ContentScroll = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 15px;
`;

interface ChatMetaSidebarProps {
  workspaceId: string;
  chatAreaRef: React.RefObject<HTMLDivElement>;
}

const ChatMetaSidebarComponent: React.FC<ChatMetaSidebarProps> = ({ workspaceId, chatAreaRef }) => {
  const usage = useWorkspaceUsage(workspaceId);
  const [use1M] = use1MContext();
  const chatAreaSize = useResizeObserver(chatAreaRef);

  const lastUsage = usage?.usageHistory[usage.usageHistory.length - 1];

  // Memoize vertical meter data calculation to prevent unnecessary re-renders
  const verticalMeterData = React.useMemo(() => {
    // Get model from last usage
    const model = lastUsage?.model ?? "unknown";
    return lastUsage
      ? calculateTokenMeterData(lastUsage, model, use1M, true)
      : { segments: [], totalTokens: 0, totalPercentage: 0 };
  }, [lastUsage, use1M]);

  // Calculate if we should show collapsed view with hysteresis
  // Strategy: Observe ChatArea width directly (independent of sidebar width)
  // - ChatArea has min-width: 750px and flex: 1
  // - Use hysteresis to prevent oscillation:
  //   * Collapse when chatAreaWidth <= 800px (tight space)
  //   * Expand when chatAreaWidth >= 1100px (lots of space)
  //   * Between 800-1100: maintain current state (dead zone)
  const COLLAPSE_THRESHOLD = 800; // Collapse below this
  const EXPAND_THRESHOLD = 1100; // Expand above this
  const chatAreaWidth = chatAreaSize?.width ?? 1000; // Default to large to avoid flash

  // Persist collapsed state globally (not per-workspace) since chat area width is shared
  // This prevents animation flash when switching workspaces - sidebar maintains its state
  const [showCollapsed, setShowCollapsed] = usePersistedState<boolean>(
    "chat-meta-sidebar:collapsed",
    false
  );

  React.useEffect(() => {
    if (chatAreaWidth <= COLLAPSE_THRESHOLD) {
      setShowCollapsed(true);
    } else if (chatAreaWidth >= EXPAND_THRESHOLD) {
      setShowCollapsed(false);
    }
    // Between thresholds: maintain current state (no change)
  }, [chatAreaWidth, setShowCollapsed]);

  return (
    <SidebarContainer
      collapsed={showCollapsed}
      role="complementary"
      aria-label="Workspace insights"
    >
      <FullView visible={!showCollapsed}>
        <ContentScroll role="region" aria-label="Cost breakdown">
          <CostsTab workspaceId={workspaceId} />
        </ContentScroll>
      </FullView>
      <CollapsedView visible={showCollapsed}>
        <VerticalTokenMeter data={verticalMeterData} />
      </CollapsedView>
    </SidebarContainer>
  );
};

// Memoize to prevent re-renders when parent (AIView) re-renders during streaming
// Only re-renders when workspaceId or chatAreaRef changes, or internal state updates
export const ChatMetaSidebar = React.memo(ChatMetaSidebarComponent);
