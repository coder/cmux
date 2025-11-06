import React from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useWorkspaceUsage } from "@/stores/WorkspaceStore";
import { use1MContext } from "@/hooks/use1MContext";
import { useResizeObserver } from "@/hooks/useResizeObserver";
import { CostsTab } from "./RightSidebar/CostsTab";
import { VerticalTokenMeter } from "./RightSidebar/VerticalTokenMeter";
import { ReviewPanel } from "./RightSidebar/CodeReview/ReviewPanel";
import { calculateTokenMeterData } from "@/utils/tokens/tokenMeterUtils";
import { matchesKeybind, KEYBINDS, formatKeybind } from "@/utils/ui/keybinds";
import { TooltipWrapper, Tooltip } from "./Tooltip";
import { cn } from "@/lib/utils";

interface SidebarContainerProps {
  collapsed: boolean;
  wide?: boolean;
  /** Custom width from drag-resize (takes precedence over collapsed/wide) */
  customWidth?: number;
  children: React.ReactNode;
  role: string;
  "aria-label": string;
}
const MOBILE_DEFAULT_WIDTH = 360;

/**
 * SidebarContainer - Main sidebar wrapper with dynamic width
 *
 * Width priority (first match wins):
 * 1. collapsed (20px) - Shows vertical token meter only
 * 2. customWidth - From drag-resize on Review tab
 * 3. wide - Auto-calculated max width for Review tab (when not resizing)
 * 4. default (300px) - Costs/Tools tabs
 */
const SidebarContainer = React.forwardRef<HTMLDivElement, SidebarContainerProps>(
  ({ collapsed, wide, customWidth, children, role, "aria-label": ariaLabel }, ref) => {
    const width = collapsed
      ? "20px"
      : customWidth
        ? `${customWidth}px`
        : wide
          ? "min(1200px, calc(100vw - 400px))"
          : "300px";

    return (
      <div
        ref={ref}
        className={cn(
          "bg-separator border-l border-border-light flex flex-col overflow-hidden flex-shrink-0",
          customWidth ? "" : "transition-[width] duration-200",
          collapsed && "sticky right-0 z-10 shadow-[-2px_0_4px_rgba(0,0,0,0.2)]",
          // Mobile: slide in from right (similar to left sidebar pattern)
          "max-md:fixed max-md:right-0 max-md:top-0 max-md:h-screen max-md:transition-transform max-md:duration-300",
          collapsed && "max-md:translate-x-full max-md:shadow-none",
          !collapsed &&
            "max-md:translate-x-0 max-md:w-full max-md:max-w-md max-md:z-[999] max-md:shadow-[-2px_0_8px_rgba(0,0,0,0.5)] max-md:border-l max-md:border-border-light"
        )}
        style={{ width }}
        role={role}
        aria-label={ariaLabel}
      >
        {children}
      </div>
    );
  }
);

SidebarContainer.displayName = "SidebarContainer";

type TabType = "costs" | "review";

export type { TabType };

interface RightSidebarProps {
  workspaceId: string;
  workspacePath: string;
  chatAreaRef: React.RefObject<HTMLDivElement>;
  /** Callback fired when tab selection changes (used for resize logic in AIView) */
  onTabChange?: (tab: TabType) => void;
  /** Custom width in pixels (overrides default widths when Review tab is resizable) */
  width?: number;
  /** Drag start handler for resize (Review tab only) */
  onStartResize?: (e: React.MouseEvent) => void;
  /** Whether currently resizing */
  isResizing?: boolean;
  /** Callback when user adds a review note from Code Review tab */
  onReviewNote?: (note: string) => void;
  /** Callback to expose the open sidebar function (for mobile header button) */
  onMountOpenCallback?: (openFn: () => void) => void;
}

const RightSidebarComponent: React.FC<RightSidebarProps> = ({
  workspaceId,
  workspacePath,
  chatAreaRef,
  onTabChange,
  width,
  onStartResize,
  isResizing = false,
  onReviewNote,
  onMountOpenCallback,
}) => {
  // Global tab preference (not per-workspace)
  const [selectedTab, setSelectedTab] = usePersistedState<TabType>("right-sidebar-tab", "costs");

  // Trigger for focusing Review panel (preserves hunk selection)
  const [focusTrigger, setFocusTrigger] = React.useState(0);

  // Notify parent (AIView) of tab changes so it can enable/disable resize functionality
  React.useEffect(() => {
    onTabChange?.(selectedTab);
  }, [selectedTab, onTabChange]);

  // Keyboard shortcuts for tab switching
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchesKeybind(e, KEYBINDS.COSTS_TAB)) {
        e.preventDefault();
        setSelectedTab("costs");
      } else if (matchesKeybind(e, KEYBINDS.REVIEW_TAB)) {
        e.preventDefault();
        setSelectedTab("review");
        setFocusTrigger((prev) => prev + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setSelectedTab, selectedTab]);

  const usage = useWorkspaceUsage(workspaceId);
  const [use1M] = use1MContext();
  const chatAreaSize = useResizeObserver(chatAreaRef);

  const baseId = `right-sidebar-${workspaceId}`;
  const costsTabId = `${baseId}-tab-costs`;
  const reviewTabId = `${baseId}-tab-review`;
  const costsPanelId = `${baseId}-panel-costs`;
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

  // Single render point for VerticalTokenMeter
  // Shows when: (1) collapsed, OR (2) Review tab is active
  const showMeter = showCollapsed || selectedTab === "review";
  const verticalMeter = showMeter ? <VerticalTokenMeter data={verticalMeterData} /> : null;

  // Track manual expansion to prevent auto-collapse immediately after user opens sidebar
  const manualExpandRef = React.useRef(false);
  const manualCollapseRef = React.useRef(false);
  const sidebarRef = React.useRef<HTMLDivElement | null>(null);
  const [measuredSidebarWidth, setMeasuredSidebarWidth] = React.useState<number>(0);
  const [viewportWidth, setViewportWidth] = React.useState<number>(0);

  const openSidebar = React.useCallback(
    (manual: boolean) => {
      manualCollapseRef.current = false;
      manualExpandRef.current = manual;
      setShowCollapsed(false);
    },
    [setShowCollapsed]
  );

  const closeSidebar = React.useCallback(
    (manual: boolean) => {
      if (manual) {
        manualCollapseRef.current = true;
      }
      manualExpandRef.current = false;
      setShowCollapsed(true);
    },
    [setShowCollapsed]
  );

  // Expose open function to parent (for mobile header button)
  React.useEffect(() => {
    if (onMountOpenCallback) {
      onMountOpenCallback(() => openSidebar(true));
    }
  }, [onMountOpenCallback, openSidebar]);

  const openSidebarAuto = React.useCallback(() => openSidebar(false), [openSidebar]);
  const openSidebarManual = React.useCallback(() => openSidebar(true), [openSidebar]);

  React.useEffect(() => {
    // Never collapse when Review tab is active - code review needs space
    if (selectedTab === "review") {
      if (manualCollapseRef.current) {
        return;
      }

      if (showCollapsed) {
        openSidebarAuto();
      }
      manualExpandRef.current = false;
      return;
    }

    // Reset manual collapse guard once user leaves the review tab
    manualCollapseRef.current = false;

    // If user manually expanded on mobile, keep sidebar open until they close it
    if (manualExpandRef.current) {
      return;
    }

    if (chatAreaWidth <= COLLAPSE_THRESHOLD) {
      if (!showCollapsed) {
        closeSidebar(false);
      }
    } else if (chatAreaWidth >= EXPAND_THRESHOLD) {
      if (showCollapsed) {
        openSidebarAuto();
      }
    }
    // Between thresholds: maintain current state (no change)
  }, [chatAreaWidth, selectedTab, showCollapsed, closeSidebar, openSidebarAuto]);

  // Swipe gesture detection for mobile - right-to-left swipe to open sidebar
  React.useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const updateViewportWidth = () => {
      setViewportWidth(window.innerWidth);
    };

    updateViewportWidth();
    window.addEventListener("resize", updateViewportWidth);
    return () => window.removeEventListener("resize", updateViewportWidth);
  }, []);

  React.useEffect(() => {
    const element = sidebarRef.current;
    if (!element) {
      return;
    }

    const updateMeasuredWidth = () => {
      setMeasuredSidebarWidth(element.getBoundingClientRect().width);
    };

    updateMeasuredWidth();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setMeasuredSidebarWidth(entry.contentRect.width);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [showCollapsed, selectedTab, width]);

  const effectiveSidebarWidth = React.useMemo(() => {
    if (!viewportWidth) {
      return null;
    }

    const candidate =
      (measuredSidebarWidth > 0 ? measuredSidebarWidth : undefined) ??
      (typeof width === "number" && width > 0 ? width : undefined) ??
      MOBILE_DEFAULT_WIDTH;
    const sanitized = candidate > 0 ? candidate : MOBILE_DEFAULT_WIDTH;
    return Math.min(sanitized, viewportWidth);
  }, [measuredSidebarWidth, width, viewportWidth]);

  const overlayClickableWidth = React.useMemo(() => {
    if (showCollapsed || !viewportWidth) {
      return 0;
    }

    const sidebarWidthForCalc = effectiveSidebarWidth ?? MOBILE_DEFAULT_WIDTH;
    return Math.max(viewportWidth - sidebarWidthForCalc, 0);
  }, [effectiveSidebarWidth, showCollapsed, viewportWidth]);

  React.useEffect(() => {
    // Only enable swipe on mobile when sidebar is collapsed
    if (typeof window === "undefined") return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    const handleTouchStart = (e: TouchEvent) => {
      // Only detect swipes from right edge (last ~50px of screen)
      const touch = e.touches[0];
      if (!touch) return;

      const screenWidth = window.innerWidth;
      if (touch.clientX < screenWidth - 50) return; // Not from right edge

      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchStartTime = Date.now();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0];
      if (!touch) return;

      const touchEndX = touch.clientX;
      const touchEndY = touch.clientY;
      const touchEndTime = Date.now();

      // Calculate swipe distance and direction
      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;
      const duration = touchEndTime - touchStartTime;

      // Swipe must be:
      // 1. Horizontal (more X movement than Y)
      // 2. At least 50px distance
      // 3. Fast enough (< 300ms)
      const isLeftSwipe = deltaX < -50; // Right to left
      const isRightSwipe = deltaX > 50; // Left to right
      const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
      const isFastEnough = duration < 300;

      // Open sidebar on left swipe from right edge when collapsed
      if (isLeftSwipe && isHorizontal && isFastEnough && showCollapsed) {
        openSidebarManual();
      }
      // Close sidebar on right swipe when open (from anywhere on screen)
      else if (isRightSwipe && isHorizontal && isFastEnough && !showCollapsed) {
        closeSidebar(true);
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [showCollapsed, closeSidebar, openSidebarManual]);

  return (
    <>
      {/* Backdrop overlay - only on mobile when sidebar is expanded */}
      {!showCollapsed && (
        <div className="fixed inset-0 z-[998] hidden max-md:block" aria-hidden="true">
          <div className="pointer-events-none absolute inset-0 bg-black/50 backdrop-blur-sm" />
          {overlayClickableWidth > 1 && (
            <button
              type="button"
              className="absolute top-0 left-0 h-full bg-transparent"
              style={{ width: overlayClickableWidth }}
              onClick={() => closeSidebar(true)}
              aria-label="Close review panel"
            />
          )}
        </div>
      )}

      <SidebarContainer
        ref={sidebarRef}
        collapsed={showCollapsed}
        wide={selectedTab === "review" && !width} // Auto-wide only if not drag-resizing
        customWidth={width} // Drag-resized width from AIView (Review tab only)
        role="complementary"
        aria-label="Workspace insights"
      >
        {/* Full view when not collapsed */}
        <div className={cn("flex-row h-full", !showCollapsed ? "flex" : "hidden")}>
          {/* Render meter when Review tab is active */}
          {selectedTab === "review" && (
            <div className="bg-separator border-border-light flex w-5 shrink-0 flex-col border-r">
              {verticalMeter}
            </div>
          )}

          {/* Render resize handle to right of meter when Review tab is active */}
          {selectedTab === "review" && onStartResize && (
            <div
              className={cn(
                "w-1 flex-shrink-0 z-10 transition-[background] duration-150",
                "bg-border-light cursor-col-resize hover:bg-accent",
                isResizing && "bg-accent"
              )}
              onMouseDown={(e) => onStartResize(e as unknown as React.MouseEvent)}
            />
          )}

          <div className="flex min-w-0 flex-1 flex-col">
            <div
              className="bg-background-secondary border-border flex items-center border-b px-2 py-2 max-md:gap-2"
              role="tablist"
              aria-label="Metadata views"
            >
              {/* Close button - only visible on mobile */}
              <button
                onClick={() => closeSidebar(true)}
                title="Close panel"
                aria-label="Close panel"
                className={cn(
                  "hidden max-md:inline-flex h-7 w-7 items-center justify-center rounded-md",
                  "border border-border-light/80 bg-separator/90 text-xs font-semibold text-foreground",
                  "shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-all duration-200",
                  "hover:bg-hover hover:border-bg-light active:scale-95"
                )}
              >
                ×
              </button>

              <div className="flex flex-1 gap-1 [&>*]:flex-1">
                <TooltipWrapper inline>
                  <button
                    className={cn(
                      "w-full py-2 px-[15px] border-none border-solid cursor-pointer font-primary text-[13px] font-medium transition-all duration-200",
                      selectedTab === "costs"
                        ? "text-white bg-separator border-b-2 border-b-plan-mode"
                        : "bg-transparent text-secondary border-b-2 border-b-transparent hover:bg-background-secondary hover:text-foreground"
                    )}
                    onClick={() => setSelectedTab("costs")}
                    id={costsTabId}
                    role="tab"
                    type="button"
                    aria-selected={selectedTab === "costs"}
                    aria-controls={costsPanelId}
                  >
                    Costs
                  </button>
                  <Tooltip className="tooltip" position="bottom" align="center">
                    {formatKeybind(KEYBINDS.COSTS_TAB)}
                  </Tooltip>
                </TooltipWrapper>
                <TooltipWrapper inline>
                  <button
                    className={cn(
                      "w-full py-2 px-[15px] border-none border-solid cursor-pointer font-primary text-[13px] font-medium transition-all duration-200",
                      selectedTab === "review"
                        ? "text-white bg-separator border-b-2 border-b-plan-mode"
                        : "bg-transparent text-secondary border-b-2 border-b-transparent hover:bg-background-secondary hover:text-foreground"
                    )}
                    onClick={() => {
                      setSelectedTab("review");
                      setFocusTrigger((prev) => prev + 1);
                    }}
                    id={reviewTabId}
                    role="tab"
                    type="button"
                    aria-selected={selectedTab === "review"}
                    aria-controls={reviewPanelId}
                  >
                    Review
                  </button>
                  <Tooltip className="tooltip" position="bottom" align="center">
                    {formatKeybind(KEYBINDS.REVIEW_TAB)}
                  </Tooltip>
                </TooltipWrapper>
              </div>
            </div>
            <div
              className={cn(
                "flex-1 overflow-y-auto",
                selectedTab === "review" ? "p-0" : "p-[15px]"
              )}
            >
              {selectedTab === "costs" && (
                <div role="tabpanel" id={costsPanelId} aria-labelledby={costsTabId}>
                  <CostsTab workspaceId={workspaceId} />
                </div>
              )}
              {selectedTab === "review" && (
                <div
                  role="tabpanel"
                  id={reviewPanelId}
                  aria-labelledby={reviewTabId}
                  className="h-full"
                >
                  <ReviewPanel
                    workspaceId={workspaceId}
                    workspacePath={workspacePath}
                    onReviewNote={onReviewNote}
                    focusTrigger={focusTrigger}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Render meter in collapsed view when sidebar is collapsed */}
        <div className={cn("h-full", showCollapsed ? "flex" : "hidden")}>{verticalMeter}</div>
      </SidebarContainer>
    </>
  );
};

// Memoize to prevent re-renders when parent (AIView) re-renders during streaming
// Only re-renders when workspaceId or chatAreaRef changes, or internal state updates
export const RightSidebar = React.memo(RightSidebarComponent);
