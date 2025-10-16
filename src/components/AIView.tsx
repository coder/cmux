import React, { useState, useCallback, useEffect, useRef } from "react";
import styled from "@emotion/styled";
import { MessageRenderer } from "./Messages/MessageRenderer";
import { InterruptedBarrier } from "./Messages/ChatBarrier/InterruptedBarrier";
import { StreamingBarrier } from "./Messages/ChatBarrier/StreamingBarrier";
import { RetryBarrier } from "./Messages/ChatBarrier/RetryBarrier";
import { PinnedTodoList } from "./PinnedTodoList";
import { getAutoRetryKey } from "@/constants/storage";
import { ChatInput, type ChatInputAPI } from "./ChatInput";
import { ChatMetaSidebar } from "./ChatMetaSidebar";
import {
  shouldShowInterruptedBarrier,
  mergeConsecutiveStreamErrors,
} from "@/utils/messages/messageUtils";
import { hasInterruptedStream } from "@/utils/messages/retryEligibility";
import { ChatProvider } from "@/contexts/ChatContext";
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

const ViewContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: row;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: var(--font-monospace);
  font-size: 12px;
  overflow-x: auto;
  overflow-y: hidden;
  container-type: inline-size;
`;

const ChatArea = styled.div`
  flex: 1;
  min-width: 750px;
  display: flex;
  flex-direction: column;
`;

const ViewHeader = styled.div`
  padding: 4px 15px;
  background: #252526;
  border-bottom: 1px solid #3e3e42;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const WorkspaceTitle = styled.div`
  font-weight: 600;
  color: #cccccc;
  display: flex;
  align-items: center;
  gap: 8px;
`;

const WorkspacePath = styled.span`
  font-family: var(--font-monospace);
  color: #888;
  font-weight: 400;
  font-size: 11px;
`;

const TerminalIconButton = styled.button`
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #888;
  transition: color 0.2s;

  &:hover {
    color: #ccc;
  }

  svg {
    width: 16px;
    height: 16px;
  }
`;

const LoadingIndicator = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #888;
  font-size: 14px;
`;

const OutputContainer = styled.div`
  flex: 1;
  position: relative;
  overflow: hidden;
`;

const OutputContent = styled.div`
  height: 100%;
  overflow-y: auto;
  padding: 15px;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #6b6b6b;
  text-align: center;

  h3 {
    margin: 0 0 10px 0;
    font-size: 16px;
    font-weight: 500;
  }

  p {
    margin: 0;
    font-size: 13px;
  }
`;

const EditBarrier = styled.div`
  margin: 20px 0;
  padding: 12px 15px;
  background: var(--color-editing-mode-alpha);
  border-bottom: 3px solid;
  border-image: repeating-linear-gradient(
      45deg,
      var(--color-editing-mode),
      var(--color-editing-mode) 10px,
      transparent 10px,
      transparent 20px
    )
    1;
  color: var(--color-editing-mode);
  font-size: 12px;
  font-weight: 500;
  text-align: center;
`;

const JumpToBottomIndicator = styled.button`
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  padding: 4px 8px;
  background: hsl(from var(--color-assistant-border) h s l / 0.1);
  color: white;
  border: 1px solid hsl(from var(--color-assistant-border) h s l / 0.4);
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  transition: all 0.2s ease;
  z-index: 100;
  font-family: var(--font-primary);
  backdrop-filter: blur(1px);

  &:hover {
    background: hsl(from var(--color-assistant-border) h s l / 0.4);
    border-color: hsl(from var(--color-assistant-border) h s l / 0.6);
    transform: translateX(-50%) scale(1.05);
  }

  &:active {
    transform: translateX(-50%) scale(0.95);
  }
`;

interface AIViewProps {
  workspaceId: string;
  projectName: string;
  branch: string;
  workspacePath: string;
  className?: string;
}

const AIViewInner: React.FC<AIViewProps> = ({
  workspaceId,
  projectName,
  branch,
  workspacePath,
  className,
}) => {
  const chatAreaRef = useRef<HTMLDivElement>(null);

  // NEW: Get workspace state from store (only re-renders when THIS workspace changes)
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
    }
  }, [workspaceState]);

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
    void window.api.workspace.openTerminal(workspacePath);
  }, [workspacePath]);

  // Auto-scroll when messages update (during streaming)
  useEffect(() => {
    if (workspaceState && autoScroll) {
      performAutoScroll();
    }
  }, [workspaceState?.messages, autoScroll, performAutoScroll, workspaceState]);

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
      ? !workspaceState.canInterrupt && hasInterruptedStream(workspaceState.messages)
      : false,
    currentWorkspaceThinking,
    setThinkingLevel,
    setAutoRetry,
    chatInputAPI,
    jumpToBottom,
    handleOpenTerminal,
  });

  // Clear editing state if the message being edited no longer exists
  // Must be before early return to satisfy React Hooks rules
  useEffect(() => {
    if (!workspaceState || !editingMessage) return;

    const mergedMessages = mergeConsecutiveStreamErrors(workspaceState.messages);
    const editCutoffHistoryId = mergedMessages.find(
      (msg): msg is Exclude<DisplayedMessage, { type: "history-hidden" }> =>
        msg.type !== "history-hidden" && msg.historyId === editingMessage.id
    )?.historyId;

    if (!editCutoffHistoryId) {
      // Message was replaced or deleted - clear editing state
      setEditingMessage(undefined);
    }
  }, [workspaceState, editingMessage]);

  // Return early if workspace state not loaded yet
  if (!workspaceState) {
    return (
      <ViewContainer className={className}>
        <ChatArea ref={chatAreaRef}>
          <OutputContainer>
            <LoadingIndicator>Loading workspace...</LoadingIndicator>
          </OutputContainer>
        </ChatArea>
      </ViewContainer>
    );
  }

  // Extract state from workspace state
  const { messages, canInterrupt, isCompacting, loading, cmuxMessages, currentModel } =
    workspaceState;

  // Get active stream message ID for token counting
  const activeStreamMessageId = aggregator.getActiveStreamMessageId();

  // Track if last message was interrupted or errored (for RetryBarrier)
  // Uses same logic as useResumeManager for DRY
  const showRetryBarrier = !canInterrupt && hasInterruptedStream(messages);

  // Note: We intentionally do NOT reset autoRetry when streams start.
  // If user pressed Ctrl+C, autoRetry stays false until they manually retry.
  // This makes state transitions explicit and predictable.

  // Merge consecutive identical stream errors
  const mergedMessages = mergeConsecutiveStreamErrors(messages);

  // When editing, find the cutoff point
  const editCutoffHistoryId = editingMessage
    ? mergedMessages.find(
        (msg): msg is Exclude<DisplayedMessage, { type: "history-hidden" }> =>
          msg.type !== "history-hidden" && msg.historyId === editingMessage.id
      )?.historyId
    : undefined;

  if (loading) {
    return (
      <ViewContainer className={className}>
        <EmptyState>
          <h3>Loading workspace...</h3>
        </EmptyState>
      </ViewContainer>
    );
  }

  if (!projectName || !branch) {
    return (
      <ViewContainer className={className}>
        <EmptyState>
          <h3>No Workspace Selected</h3>
          <p>Select a workspace from the sidebar to view and interact with Claude</p>
        </EmptyState>
      </ViewContainer>
    );
  }

  return (
    <ChatProvider messages={messages} cmuxMessages={cmuxMessages} model={currentModel ?? "unknown"}>
      <ViewContainer className={className}>
        <ChatArea ref={chatAreaRef}>
          <ViewHeader>
            <WorkspaceTitle>
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
              {projectName} / {branch}
              <WorkspacePath>{workspacePath}</WorkspacePath>
              <TooltipWrapper inline>
                <TerminalIconButton onClick={handleOpenTerminal}>
                  <svg viewBox="0 0 16 16" fill="currentColor">
                    <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0114.25 15H1.75A1.75 1.75 0 010 13.25V2.75zm1.75-.25a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V2.75a.25.25 0 00-.25-.25H1.75zM7.25 8a.75.75 0 01-.22.53l-2.25 2.25a.75.75 0 01-1.06-1.06L5.44 8 3.72 6.28a.75.75 0 111.06-1.06l2.25 2.25c.141.14.22.331.22.53zm1.5 1.5a.75.75 0 000 1.5h3a.75.75 0 000-1.5h-3z" />
                  </svg>
                </TerminalIconButton>
                <Tooltip className="tooltip" position="bottom" align="center">
                  Open in terminal ({formatKeybind(KEYBINDS.OPEN_TERMINAL)})
                </Tooltip>
              </TooltipWrapper>
            </WorkspaceTitle>
          </ViewHeader>

          <OutputContainer>
            <OutputContent
              ref={contentRef}
              onWheel={markUserInteraction}
              onTouchMove={markUserInteraction}
              onScroll={handleScroll}
              role="log"
              aria-live={canInterrupt ? "polite" : "off"}
              aria-busy={canInterrupt}
              aria-label="Conversation transcript"
              tabIndex={0}
            >
              {mergedMessages.length === 0 ? (
                <EmptyState>
                  <h3>No Messages Yet</h3>
                  <p>Send a message below to begin</p>
                </EmptyState>
              ) : (
                <>
                  {mergedMessages.map((msg) => {
                    const isAtCutoff =
                      editCutoffHistoryId !== undefined &&
                      msg.type !== "history-hidden" &&
                      msg.historyId === editCutoffHistoryId;

                    return (
                      <React.Fragment key={msg.id}>
                        <MessageRenderer
                          message={msg}
                          onEditUserMessage={handleEditUserMessage}
                          workspaceId={workspaceId}
                          isCompacting={isCompacting}
                        />
                        {isAtCutoff && (
                          <EditBarrier>
                            ⚠️ Messages below this line will be removed when you submit the edit
                          </EditBarrier>
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
                      ? "compacting..."
                      : currentModel
                        ? `${getModelName(currentModel)} streaming...`
                        : "streaming..."
                  }
                  cancelText={`hit ${formatKeybind(KEYBINDS.INTERRUPT_STREAM)} to cancel`}
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
            </OutputContent>
            {!autoScroll && (
              <JumpToBottomIndicator onClick={jumpToBottom} type="button">
                Press {formatKeybind(KEYBINDS.JUMP_TO_BOTTOM)} to jump to bottom
              </JumpToBottomIndicator>
            )}
          </OutputContainer>

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
        </ChatArea>

        <ChatMetaSidebar workspaceId={workspaceId} chatAreaRef={chatAreaRef} />
      </ViewContainer>
    </ChatProvider>
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
