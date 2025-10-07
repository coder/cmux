import React, { useState, useCallback, useEffect } from "react";
import styled from "@emotion/styled";
import { MessageRenderer } from "./Messages/MessageRenderer";
import { InterruptedBarrier } from "./Messages/ChatBarrier/InterruptedBarrier";
import { StreamingBarrier } from "./Messages/ChatBarrier/StreamingBarrier";
import { ChatInput } from "./ChatInput";
import { ChatMetaSidebar } from "./ChatMetaSidebar";
import { shouldShowInterruptedBarrier } from "@/utils/messages/messageUtils";
import { ChatProvider } from "@/contexts/ChatContext";
import { ThinkingProvider } from "@/contexts/ThinkingContext";
import { ModeProvider } from "@/contexts/ModeContext";
import { matchesKeybind, formatKeybind, KEYBINDS, isEditableElement } from "@/utils/ui/keybinds";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import type { WorkspaceState } from "@/hooks/useWorkspaceAggregators";
import { StatusIndicator } from "./StatusIndicator";

const ViewContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: row;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: var(--font-monospace);
  font-size: 12px;
  overflow: hidden;
  container-type: inline-size;
`;

const ChatArea = styled.div`
  flex: 1;
  min-width: 750px;
  display: flex;
  flex-direction: column;
`;

const ViewHeader = styled.div`
  padding: 10px 15px;
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

const JumpToBottomIndicator = styled.div`
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
  workspaceState: WorkspaceState;
  className?: string;
}

const AIViewInner: React.FC<AIViewProps> = ({
  workspaceId,
  projectName,
  branch,
  workspaceState,
  className,
}) => {
  const [editingMessage, setEditingMessage] = useState<{ id: string; content: string } | undefined>(
    undefined
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

  // Extract state from workspace state prop
  const { messages, canInterrupt, isCompacting, loading, cmuxMessages, currentModel } =
    workspaceState;

  // Auto-scroll when messages update (during streaming)
  useEffect(() => {
    if (autoScroll) {
      performAutoScroll();
    }
  }, [messages, autoScroll, performAutoScroll]);

  // Handlers for editing messages
  const handleEditUserMessage = useCallback((messageId: string, content: string) => {
    setEditingMessage({ id: messageId, content });
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(undefined);
  }, []);

  // When editing, find the cutoff point
  const editCutoffHistoryId = editingMessage
    ? messages.find((msg) => msg.historyId === editingMessage.id)?.historyId
    : undefined;

  const handleMessageSent = useCallback(() => {
    // Enable auto-scroll when user sends a message
    setAutoScroll(true);
  }, [setAutoScroll]);

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

  // Scroll to bottom when workspace loads or changes
  useEffect(() => {
    if (!loading && messages.length > 0) {
      // Give React time to render messages before scrolling
      requestAnimationFrame(() => {
        jumpToBottom();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, loading]);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts if user is typing in an input field
      if (isEditableElement(e.target)) {
        return;
      }

      if (matchesKeybind(e, KEYBINDS.JUMP_TO_BOTTOM)) {
        e.preventDefault();
        jumpToBottom();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [jumpToBottom]);

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
    <ChatProvider messages={messages} cmuxMessages={cmuxMessages} model={currentModel}>
      <ViewContainer className={className}>
        <ChatArea>
          <ViewHeader>
            <WorkspaceTitle>
              <StatusIndicator
                streaming={canInterrupt}
                title={canInterrupt ? "Streaming..." : "Idle"}
              />
              {projectName} / {branch}
            </WorkspaceTitle>
          </ViewHeader>

          <OutputContainer>
            <OutputContent
              ref={contentRef}
              onWheel={markUserInteraction}
              onTouchMove={markUserInteraction}
              onScroll={handleScroll}
            >
              {messages.length === 0 ? (
                <EmptyState>
                  <h3>No Messages Yet</h3>
                  <p>Send a message below to begin</p>
                </EmptyState>
              ) : (
                <>
                  {messages.map((msg) => {
                    const isAtCutoff =
                      editCutoffHistoryId !== undefined && msg.historyId === editCutoffHistoryId;

                    return (
                      <React.Fragment key={msg.id}>
                        <MessageRenderer message={msg} onEditUserMessage={handleEditUserMessage} />
                        {isAtCutoff && (
                          <EditBarrier>
                            ⚠️ Messages below this line will be removed when you submit the edit
                          </EditBarrier>
                        )}
                        {shouldShowInterruptedBarrier(msg) && <InterruptedBarrier />}
                      </React.Fragment>
                    );
                  })}
                </>
              )}
              {canInterrupt && (
                <StreamingBarrier
                  text={isCompacting ? "compacting... hit Esc to cancel" : undefined}
                />
              )}
            </OutputContent>
            {!autoScroll && (
              <JumpToBottomIndicator onClick={jumpToBottom}>
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
            canInterrupt={canInterrupt}
          />
        </ChatArea>

        <ChatMetaSidebar workspaceId={workspaceId} />
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
