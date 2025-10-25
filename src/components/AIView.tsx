import React, { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { MessageRenderer } from "./Messages/MessageRenderer";
import { InterruptedBarrier } from "./Messages/ChatBarrier/InterruptedBarrier";
import { StreamingBarrier } from "./Messages/ChatBarrier/StreamingBarrier";
import { RetryBarrier } from "./Messages/ChatBarrier/RetryBarrier";
import { PinnedTodoList } from "./PinnedTodoList";
import { getAutoRetryKey } from "@/constants/storage";
import { ChatInput, type ChatInputAPI } from "./ChatInput";
import { RightSidebar, type TabType } from "./RightSidebar";
import { useResizableSidebar } from "@/hooks/useResizableSidebar";
import {
  shouldShowInterruptedBarrier,
  mergeConsecutiveStreamErrors,
} from "@/utils/messages/messageUtils";
import { hasInterruptedStream } from "@/utils/messages/retryEligibility";
import { ThinkingProvider } from "@/contexts/ThinkingContext";
import { ModeProvider } from "@/contexts/ModeContext";
import { formatKeybind, KEYBINDS } from "@/utils/ui/keybinds";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useThinking } from "@/contexts/ThinkingContext";
import { useWorkspaceState, useWorkspaceAggregator } from "@/stores/WorkspaceStore";
import { StatusIndicator } from "./StatusIndicator";
import { getModelName } from "@/utils/ai/models";
import { GitStatusIndicator } from "./GitStatusIndicator";

import { useGitStatus } from "@/stores/GitStatusStore";
import { TooltipWrapper, Tooltip } from "./Tooltip";
import type { DisplayedMessage } from "@/types/message";
import { useAIViewKeybinds } from "@/hooks/useAIViewKeybinds";

interface AIViewProps {
  workspaceId: string;
  projectName: string;
  branch: string;
  namedWorkspacePath: string; // User-friendly path for display and terminal
  className?: string;
}

const AIViewInner: React.FC<AIViewProps> = ({
  workspaceId,
  projectName,
  branch,
  namedWorkspacePath,
  className,
}) => {
  const chatAreaRef = useRef<HTMLDivElement>(null);

  // Track active tab to conditionally enable resize functionality
  // RightSidebar notifies us of tab changes via onTabChange callback
  const [activeTab, setActiveTab] = useState<TabType>("costs");
  const isReviewTabActive = activeTab === "review";

  // Resizable sidebar for Review tab only
  // Hook encapsulates all drag logic, persistence, and constraints
  // Returns width to apply to RightSidebar and startResize for handle's onMouseDown
  const {
    width: sidebarWidth,
    isResizing,
    startResize,
  } = useResizableSidebar({
    enabled: isReviewTabActive, // Only active on Review tab
    defaultWidth: 600, // Initial width or fallback
    minWidth: 300, // Can't shrink smaller
    maxWidth: 1200, // Can't grow larger
    storageKey: "review-sidebar-width", // Persists across sessions
  });

  // Get workspace state from store (only re-renders when THIS workspace changes)
  const workspaceState = useWorkspaceState(workspaceId);
  const aggregator = useWorkspaceAggregator(workspaceId);

  // Get git status for this workspace
  const gitStatus = useGitStatus(workspaceId);

  const [editingMessage, setEditingMessage] = useState<{ id: string; content: string } | undefined>(
    undefined
  );

  // Auto-retry state (persisted per workspace, with cross-component sync)
  // Semantics:
  //   true (default): System errors should auto-retry
  //   false: User stopped this (Ctrl+C), don't auto-retry until user re-engages
  // State transitions are EXPLICIT only:
  //   - User presses Ctrl+C → false
  //   - User sends a message → true (clear intent: "I'm using this workspace")
  //   - User clicks manual retry button → true
  // No automatic resets on stream events - prevents initialization bugs
  const [autoRetry, setAutoRetry] = usePersistedState<boolean>(
    getAutoRetryKey(workspaceId),
    true, // Default to true
    { listener: true } // Enable cross-component synchronization
  );

  // Use auto-scroll hook for scroll management
  const {
    contentRef,
    autoScroll,
    setAutoScroll,
    performAutoScroll,
    jumpToBottom,
    handleScroll,
    markUserInteraction,
  } = useAutoScroll();

  // ChatInput API for focus management
  const chatInputAPI = useRef<ChatInputAPI | null>(null);
  const handleChatInputReady = useCallback((api: ChatInputAPI) => {
    chatInputAPI.current = api;
  }, []);

  // Handler for review notes from Code Review tab
  const handleReviewNote = useCallback((note: string) => {
    chatInputAPI.current?.appendText(note);
  }, []);

  // Thinking level state from context
  const { thinkingLevel: currentWorkspaceThinking, setThinkingLevel } = useThinking();

  // Handlers for editing messages
  const handleEditUserMessage = useCallback((messageId: string, content: string) => {
    setEditingMessage({ id: messageId, content });
  }, []);

  const handleEditLastUserMessage = useCallback(() => {
    if (!workspaceState) return;
    const mergedMessages = mergeConsecutiveStreamErrors(workspaceState.messages);
    const lastUserMessage = [...mergedMessages]
      .reverse()
      .find((msg): msg is Extract<DisplayedMessage, { type: "user" }> => msg.type === "user");
    if (lastUserMessage) {
      setEditingMessage({ id: lastUserMessage.historyId, content: lastUserMessage.content });
      setAutoScroll(false); // Show jump-to-bottom indicator

      // Scroll to the message being edited
      requestAnimationFrame(() => {
        const element = contentRef.current?.querySelector(
          `[data-message-id="${lastUserMessage.historyId}"]`
        );
        element?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [workspaceState, contentRef, setAutoScroll]);

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(undefined);
  }, []);

  const handleMessageSent = useCallback(() => {
    // Enable auto-scroll when user sends a message
    setAutoScroll(true);

    // Reset autoRetry when user sends a message
    // User action = clear intent: "I'm actively using this workspace"
    setAutoRetry(true);
  }, [setAutoScroll, setAutoRetry]);

  const handleClearHistory = useCallback(
    async (percentage = 1.0) => {
      // Enable auto-scroll after clearing
      setAutoScroll(true);

      // Truncate history in backend
      await window.api.workspace.truncateHistory(workspaceId, percentage);
    },
    [workspaceId, setAutoScroll]
  );

  const handleProviderConfig = useCallback(
    async (provider: string, keyPath: string[], value: string) => {
      const result = await window.api.providers.setProviderConfig(provider, keyPath, value);
      if (!result.success) {
        throw new Error(result.error);
      }
    },
    []
  );

  const handleOpenTerminal = useCallback(() => {
    void window.api.workspace.openTerminal(namedWorkspacePath);
  }, [namedWorkspacePath]);

  // Auto-scroll when messages or todos update (during streaming)
  useEffect(() => {
    if (workspaceState && autoScroll) {
      performAutoScroll();
    }
  }, [
    workspaceState?.messages,
    workspaceState?.todos,
    autoScroll,
    performAutoScroll,
    workspaceState,
  ]);

  // Scroll to bottom when workspace loads or changes
  useEffect(() => {
    if (workspaceState && !workspaceState.loading && workspaceState.messages.length > 0) {
      // Give React time to render messages before scrolling
      requestAnimationFrame(() => {
        jumpToBottom();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, workspaceState?.loading]);

  // Handle keyboard shortcuts (using optional refs that are safe even if not initialized)
  useAIViewKeybinds({
    workspaceId,
    currentModel: workspaceState?.currentModel ?? null,
    canInterrupt: workspaceState?.canInterrupt ?? false,
    showRetryBarrier: workspaceState
      ? !workspaceState.canInterrupt &&
        hasInterruptedStream(workspaceState.messages, workspaceState.pendingStreamStart)
      : false,
    currentWorkspaceThinking,
    setThinkingLevel,
    setAutoRetry,
    chatInputAPI,
    jumpToBottom,
    handleOpenTerminal,
    aggregator,
    setEditingMessage,
  });

  // Clear editing state if the message being edited no longer exists
  // Must be before early return to satisfy React Hooks rules
  useEffect(() => {
    if (!workspaceState || !editingMessage) return;

    const mergedMessages = mergeConsecutiveStreamErrors(workspaceState.messages);
    const editCutoffHistoryId = mergedMessages.find(
      (msg): msg is Exclude<DisplayedMessage, { type: "history-hidden" | "workspace-init" }> =>
        msg.type !== "history-hidden" &&
        msg.type !== "workspace-init" &&
        msg.historyId === editingMessage.id
    )?.historyId;

    if (!editCutoffHistoryId) {
      // Message was replaced or deleted - clear editing state
      setEditingMessage(undefined);
    }
  }, [workspaceState, editingMessage]);

  // Return early if workspace state not loaded yet
  if (!workspaceState) {
    return (
      <div
        className={cn(
          "flex flex-1 flex-row bg-dark text-light overflow-x-auto overflow-y-hidden [@media(max-width:768px)]:flex-col",
          className
        )}
        style={{ containerType: "inline-size" }}
      >
        <div className="text-placeholder flex h-full flex-1 flex-col items-center justify-center text-center">
          <h3 className="m-0 mb-2.5 text-base font-medium">Loading workspace...</h3>
        </div>
      </div>
    );
  }

  // Extract state from workspace state
  const { messages, canInterrupt, isCompacting, loading, currentModel, pendingStreamStart } =
    workspaceState;

  // Get active stream message ID for token counting
  const activeStreamMessageId = aggregator.getActiveStreamMessageId();

  // Track if last message was interrupted or errored (for RetryBarrier)
  // Uses same logic as useResumeManager for DRY
  const showRetryBarrier = !canInterrupt && hasInterruptedStream(messages, pendingStreamStart);

  // Note: We intentionally do NOT reset autoRetry when streams start.
  // If user pressed Ctrl+C, autoRetry stays false until they manually retry.
  // This makes state transitions explicit and predictable.

  // Merge consecutive identical stream errors
  const mergedMessages = mergeConsecutiveStreamErrors(messages);

  // When editing, find the cutoff point
  const editCutoffHistoryId = editingMessage
    ? mergedMessages.find(
        (msg): msg is Exclude<DisplayedMessage, { type: "history-hidden" | "workspace-init" }> =>
          msg.type !== "history-hidden" &&
          msg.type !== "workspace-init" &&
          msg.historyId === editingMessage.id
      )?.historyId
    : undefined;

  if (loading) {
    return (
      <div
        className={cn(
          "flex flex-1 flex-row bg-dark text-light overflow-x-auto overflow-y-hidden [@media(max-width:768px)]:flex-col",
          className
        )}
        style={{ containerType: "inline-size" }}
      >
        <div className="text-placeholder flex h-full flex-1 flex-col items-center justify-center text-center">
          <h3 className="m-0 mb-2.5 text-base font-medium">Loading workspace...</h3>
        </div>
      </div>
    );
  }

  if (!projectName || !branch) {
    return (
      <div
        className={cn(
          "flex flex-1 flex-row bg-dark text-light overflow-x-auto overflow-y-hidden [@media(max-width:768px)]:flex-col",
          className
        )}
        style={{ containerType: "inline-size" }}
      >
        <div className="text-placeholder flex h-full flex-1 flex-col items-center justify-center text-center">
          <h3 className="m-0 mb-2.5 text-base font-medium">No Workspace Selected</h3>
          <p className="m-0 text-[13px]">
            Select a workspace from the sidebar to view and interact with Claude
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-1 flex-row bg-dark text-light overflow-x-auto overflow-y-hidden [@media(max-width:768px)]:flex-col",
        className
      )}
      style={{ containerType: "inline-size" }}
    >
      <div
        ref={chatAreaRef}
        className="flex min-w-96 flex-1 flex-col [@media(max-width:768px)]:max-h-full [@media(max-width:768px)]:w-full [@media(max-width:768px)]:min-w-0"
      >
        <div className="bg-separator border-border-light flex items-center justify-between border-b px-[15px] py-1 [@media(max-width:768px)]:flex-wrap [@media(max-width:768px)]:gap-2 [@media(max-width:768px)]:py-2 [@media(max-width:768px)]:pl-[60px]">
          <div className="text-foreground flex min-w-0 items-center gap-2 overflow-hidden font-semibold">
            <StatusIndicator
              streaming={canInterrupt}
              title={
                canInterrupt && currentModel ? `${getModelName(currentModel)} streaming` : "Idle"
              }
            />
            <GitStatusIndicator
              gitStatus={gitStatus}
              workspaceId={workspaceId}
              tooltipPosition="bottom"
            />
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
          </div>
        </div>

        <div className="relative flex-1 overflow-hidden">
          <div
            ref={contentRef}
            onWheel={markUserInteraction}
            onTouchMove={markUserInteraction}
            onScroll={handleScroll}
            role="log"
            aria-live={canInterrupt ? "polite" : "off"}
            aria-busy={canInterrupt}
            aria-label="Conversation transcript"
            tabIndex={0}
            className="h-full overflow-y-auto p-[15px] leading-[1.5] break-words whitespace-pre-wrap"
          >
            {mergedMessages.length === 0 ? (
              <div className="text-placeholder flex h-full flex-1 flex-col items-center justify-center text-center [&_h3]:m-0 [&_h3]:mb-2.5 [&_h3]:text-base [&_h3]:font-medium [&_p]:m-0 [&_p]:text-[13px]">
                <h3>No Messages Yet</h3>
                <p>Send a message below to begin</p>
                <p className="mt-5 text-xs text-[#888]">
                  💡 Tip: Add a{" "}
                  <code className="rounded-[3px] bg-[#2d2d30] px-1.5 py-0.5 font-mono text-[11px] text-[#d7ba7d]">
                    .cmux/init
                  </code>{" "}
                  hook to your project to run setup commands
                  <br />
                  (e.g., install dependencies, build) when creating new workspaces
                </p>
              </div>
            ) : (
              <>
                {mergedMessages.map((msg) => {
                  const isAtCutoff =
                    editCutoffHistoryId !== undefined &&
                    msg.type !== "history-hidden" &&
                    msg.type !== "workspace-init" &&
                    msg.historyId === editCutoffHistoryId;

                  return (
                    <React.Fragment key={msg.id}>
                      <div
                        data-message-id={
                          msg.type !== "history-hidden" && msg.type !== "workspace-init"
                            ? msg.historyId
                            : undefined
                        }
                      >
                        <MessageRenderer
                          message={msg}
                          onEditUserMessage={handleEditUserMessage}
                          workspaceId={workspaceId}
                          isCompacting={isCompacting}
                        />
                      </div>
                      {isAtCutoff && (
                        <div
                          className="text-edit-mode bg-edit-mode/10 my-5 px-[15px] py-3 text-center text-xs font-medium"
                          style={{
                            borderBottom: "3px solid",
                            borderImage:
                              "repeating-linear-gradient(45deg, var(--color-editing-mode), var(--color-editing-mode) 10px, transparent 10px, transparent 20px) 1",
                          }}
                        >
                          ⚠️ Messages below this line will be removed when you submit the edit
                        </div>
                      )}
                      {shouldShowInterruptedBarrier(msg) && <InterruptedBarrier />}
                    </React.Fragment>
                  );
                })}
                {/* Show RetryBarrier after the last message if needed */}
                {showRetryBarrier && (
                  <RetryBarrier
                    workspaceId={workspaceId}
                    autoRetry={autoRetry}
                    onStopAutoRetry={() => setAutoRetry(false)}
                    onResetAutoRetry={() => setAutoRetry(true)}
                  />
                )}
              </>
            )}
            <PinnedTodoList workspaceId={workspaceId} />
            {canInterrupt && (
              <StreamingBarrier
                statusText={
                  isCompacting
                    ? currentModel
                      ? `${getModelName(currentModel)} compacting...`
                      : "compacting..."
                    : currentModel
                      ? `${getModelName(currentModel)} streaming...`
                      : "streaming..."
                }
                cancelText={
                  isCompacting
                    ? `${formatKeybind(KEYBINDS.INTERRUPT_STREAM)} cancel | ${formatKeybind(KEYBINDS.ACCEPT_EARLY_COMPACTION)} accept early`
                    : `hit ${formatKeybind(KEYBINDS.INTERRUPT_STREAM)} to cancel`
                }
                tokenCount={
                  activeStreamMessageId
                    ? aggregator.getStreamingTokenCount(activeStreamMessageId)
                    : undefined
                }
                tps={
                  activeStreamMessageId
                    ? aggregator.getStreamingTPS(activeStreamMessageId)
                    : undefined
                }
              />
            )}
          </div>
          {!autoScroll && (
            <button
              onClick={jumpToBottom}
              type="button"
              className="font-primary absolute bottom-2 left-1/2 z-[100] -translate-x-1/2 cursor-pointer rounded-[20px] border px-2 py-1 text-xs font-medium text-white shadow-[0_4px_12px_rgba(0,0,0,0.3)] backdrop-blur-[1px] transition-all duration-200 hover:scale-105 active:scale-95"
              style={{
                background: "hsl(from var(--color-assistant-border) h s l / 0.1)",
                borderColor: "hsl(from var(--color-assistant-border) h s l / 0.4)",
              }}
              onMouseEnter={(e) => {
                const target = e.currentTarget;
                target.style.background = "hsl(from var(--color-assistant-border) h s l / 0.4)";
                target.style.borderColor = "hsl(from var(--color-assistant-border) h s l / 0.6)";
              }}
              onMouseLeave={(e) => {
                const target = e.currentTarget;
                target.style.background = "hsl(from var(--color-assistant-border) h s l / 0.1)";
                target.style.borderColor = "hsl(from var(--color-assistant-border) h s l / 0.4)";
              }}
            >
              Press {formatKeybind(KEYBINDS.JUMP_TO_BOTTOM)} to jump to bottom
            </button>
          )}
        </div>

        <ChatInput
          workspaceId={workspaceId}
          onMessageSent={handleMessageSent}
          onTruncateHistory={handleClearHistory}
          onProviderConfig={handleProviderConfig}
          disabled={!projectName || !branch}
          isCompacting={isCompacting}
          editingMessage={editingMessage}
          onCancelEdit={handleCancelEdit}
          onEditLastUserMessage={handleEditLastUserMessage}
          canInterrupt={canInterrupt}
          onReady={handleChatInputReady}
        />
      </div>

      <RightSidebar
        key={workspaceId}
        workspaceId={workspaceId}
        workspacePath={namedWorkspacePath}
        chatAreaRef={chatAreaRef}
        onTabChange={setActiveTab} // Notifies us when tab changes
        width={isReviewTabActive ? sidebarWidth : undefined} // Custom width only on Review tab
        onStartResize={isReviewTabActive ? startResize : undefined} // Pass resize handler when Review active
        isResizing={isResizing} // Pass resizing state
        onReviewNote={handleReviewNote} // Pass review note handler to append to chat
      />
    </div>
  );
};

// Wrapper component that provides the mode and thinking contexts
export const AIView: React.FC<AIViewProps> = (props) => {
  return (
    <ModeProvider workspaceId={props.workspaceId}>
      <ThinkingProvider workspaceId={props.workspaceId}>
        <AIViewInner {...props} />
      </ThinkingProvider>
    </ModeProvider>
  );
};
