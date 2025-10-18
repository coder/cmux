import React from "react";
import styled from "@emotion/styled";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useWorkspaceUsage } from "@/stores/WorkspaceStore";
import { use1MContext } from "@/hooks/use1MContext";
import { useResizeObserver } from "@/hooks/useResizeObserver";
import { CostsTab } from "./RightSidebar/CostsTab";
import { ToolsTab } from "./RightSidebar/ToolsTab";
import { VerticalTokenMeter } from "./RightSidebar/VerticalTokenMeter";
import { ReviewPanel } from "./CodeReview/ReviewPanel";
import { calculateTokenMeterData } from "@/utils/tokens/tokenMeterUtils";

interface SidebarContainerProps {
  collapsed: boolean;
  wide?: boolean;
}

interface SidebarContainerStyleProps extends SidebarContainerProps {
  /** Custom width from drag-resize (takes precedence over collapsed/wide) */
  customWidth?: number;
}

/**
 * SidebarContainer - Main sidebar wrapper with dynamic width
 *
 * Width priority (first match wins):
 * 1. collapsed (20px) - Shows vertical token meter only
 * 2. customWidth - From drag-resize on Review tab
 * 3. wide - Auto-calculated max width for Review tab (when not resizing)
 * 4. default (300px) - Costs/Tools tabs
 */
const SidebarContainer = styled.div<SidebarContainerStyleProps>`
  width: ${(props) => {
    if (props.collapsed) return "20px";
    if (props.customWidth) return `${props.customWidth}px`; // Drag-resized width
    if (props.wide) return "min(1200px, calc(100vw - 400px))"; // Auto-width for Review
    return "300px"; // Default for Costs/Tools
  }};
  background: #252526;
  border-left: 1px solid #3e3e42;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: ${(props) => (props.customWidth ? "none" : "width 0.2s ease")};
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

const TabBar = styled.div`
  display: flex;
  background: #2d2d2d;
  border-bottom: 1px solid #3e3e42;
`;

interface TabButtonProps {
  active: boolean;
}

const TabButton = styled.button<TabButtonProps>`
  flex: 1;
  padding: 10px 15px;
  background: ${(props) => (props.active ? "#252526" : "transparent")};
  color: ${(props) => (props.active ? "#ffffff" : "#888888")};
  border: none;
  border-bottom: 2px solid ${(props) => (props.active ? "#007acc" : "transparent")};
  cursor: pointer;
  font-family: var(--font-primary);
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s ease;

  &:hover {
    background: ${(props) => (props.active ? "#252526" : "#2d2d2d")};
    color: ${(props) => (props.active ? "#ffffff" : "#cccccc")};
  }
`;

const TabContent = styled.div<{ noPadding?: boolean }>`
  flex: 1;
  overflow-y: auto;
  padding: ${(props) => (props.noPadding ? "0" : "15px")};
`;

type TabType = "costs" | "tools" | "review";

export type { TabType };

interface RightSidebarProps {
  workspaceId: string;
  workspacePath: string;
  chatAreaRef: React.RefObject<HTMLDivElement>;
  /** Callback fired when tab selection changes (used for resize logic in AIView) */
  onTabChange?: (tab: TabType) => void;
  /** Custom width in pixels (overrides default widths when Review tab is resizable) */
  width?: number;
}

const RightSidebarComponent: React.FC<RightSidebarProps> = ({
  workspaceId,
  workspacePath,
  chatAreaRef,
  onTabChange,
  width,
}) => {
  const [selectedTab, setSelectedTab] = usePersistedState<TabType>(
    `right-sidebar-tab:${workspaceId}`,
    "costs"
  );

  // Notify parent (AIView) of tab changes so it can enable/disable resize functionality
  React.useEffect(() => {
    onTabChange?.(selectedTab);
  }, [selectedTab, onTabChange]);

  const usage = useWorkspaceUsage(workspaceId);
  const [use1M] = use1MContext();
  const chatAreaSize = useResizeObserver(chatAreaRef);

  const baseId = `right-sidebar-${workspaceId}`;
  const costsTabId = `${baseId}-tab-costs`;
  const toolsTabId = `${baseId}-tab-tools`;
  const reviewTabId = `${baseId}-tab-review`;
  const costsPanelId = `${baseId}-panel-costs`;
  const toolsPanelId = `${baseId}-panel-tools`;
  const reviewPanelId = `${baseId}-panel-review`;

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
    "right-sidebar:collapsed",
    false
  );

  React.useEffect(() => {
    // Never collapse when Review tab is active - code review needs space
    if (selectedTab === "review") {
      if (showCollapsed) {
        setShowCollapsed(false);
      }
      return;
    }

    // Normal hysteresis for Costs/Tools tabs
    if (chatAreaWidth <= COLLAPSE_THRESHOLD) {
      setShowCollapsed(true);
    } else if (chatAreaWidth >= EXPAND_THRESHOLD) {
      setShowCollapsed(false);
    }
    // Between thresholds: maintain current state (no change)
  }, [chatAreaWidth, selectedTab, showCollapsed, setShowCollapsed]);

  return (
    <SidebarContainer
      collapsed={showCollapsed}
      wide={selectedTab === "review" && !width} // Auto-wide only if not drag-resizing
      customWidth={width} // Drag-resized width from AIView (Review tab only)
      role="complementary"
      aria-label="Workspace insights"
    >
      <FullView visible={!showCollapsed}>
        <TabBar role="tablist" aria-label="Metadata views">
          <TabButton
            active={selectedTab === "costs"}
            onClick={() => setSelectedTab("costs")}
            id={costsTabId}
            role="tab"
            type="button"
            aria-selected={selectedTab === "costs"}
            aria-controls={costsPanelId}
          >
            Costs
          </TabButton>
          <TabButton
            active={selectedTab === "tools"}
            onClick={() => setSelectedTab("tools")}
            id={toolsTabId}
            role="tab"
            type="button"
            aria-selected={selectedTab === "tools"}
            aria-controls={toolsPanelId}
          >
            Tools
          </TabButton>
          <TabButton
            active={selectedTab === "review"}
            onClick={() => setSelectedTab("review")}
            id={reviewTabId}
            role="tab"
            type="button"
            aria-selected={selectedTab === "review"}
            aria-controls={reviewPanelId}
          >
            Review
          </TabButton>
        </TabBar>
        <TabContent noPadding={selectedTab === "review"}>
          {selectedTab === "costs" && (
            <div role="tabpanel" id={costsPanelId} aria-labelledby={costsTabId}>
              <CostsTab workspaceId={workspaceId} />
            </div>
          )}
          {selectedTab === "tools" && (
            <div role="tabpanel" id={toolsPanelId} aria-labelledby={toolsTabId}>
              <ToolsTab />
            </div>
          )}
          {selectedTab === "review" && (
            <div
              role="tabpanel"
              id={reviewPanelId}
              aria-labelledby={reviewTabId}
              style={{ height: "100%" }}
            >
              <ReviewPanel workspaceId={workspaceId} workspacePath={workspacePath} />
            </div>
          )}
        </TabContent>
      </FullView>
      <CollapsedView visible={showCollapsed}>
        <VerticalTokenMeter data={verticalMeterData} />
      </CollapsedView>
    </SidebarContainer>
  );
};

// Memoize to prevent re-renders when parent (AIView) re-renders during streaming
// Only re-renders when workspaceId or chatAreaRef changes, or internal state updates
export const RightSidebar = React.memo(RightSidebarComponent);
