import React, { useState, useEffect, useRef, useCallback } from "react";
import styled from "@emotion/styled";
import { MessageRenderer } from "./Messages/MessageRenderer";
import { InterruptedBarrier } from "./Messages/InterruptedBarrier";
import { ChatInput } from "./ChatInput";
import { ChatMetaSidebar } from "./ChatMetaSidebar";
import type { DisplayedMessage, CmuxMessage } from "@/types/message";
import { StreamingMessageAggregator } from "@/utils/messages/StreamingMessageAggregator";
import { shouldShowInterruptedBarrier } from "@/utils/messages/messageUtils";
import { ChatProvider } from "@/contexts/ChatContext";
import { ThinkingProvider } from "@/contexts/ThinkingContext";
import { ModeProvider } from "@/contexts/ModeContext";
import type { WorkspaceChatMessage } from "@/types/ipc";
import {
  isCaughtUpMessage,
  isStreamError,
  isDeleteMessage,
  isStreamStart,
  isStreamDelta,
  isStreamEnd,
  isStreamAbort,
  isToolCallStart,
  isToolCallDelta,
  isToolCallEnd,
  isReasoningDelta,
  isReasoningEnd,
} from "@/types/ipc";

// StreamingMessageAggregator is now imported from utils

const ViewContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: row;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: var(--font-monospace);
  font-size: 12px;
  overflow: hidden;
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

const OutputContent = styled.div`
  flex: 1;
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

const GlobalStreamingIndicator = styled.div`
  font-size: 10px;
  color: var(--color-assistant-border);
  font-style: italic;
  padding: 8px 0;
  animation: pulse 1.5s ease-in-out infinite;

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.6;
    }
    50% {
      opacity: 1;
    }
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

interface AIViewProps {
  workspaceId: string;
  projectName: string;
  branch: string;
  className?: string;
}

const AIViewInner: React.FC<AIViewProps> = ({ workspaceId, projectName, branch, className }) => {
  const [displayedMessages, setDisplayedMessages] = useState<DisplayedMessage[]>([]);
  const [isCompacting] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [currentModel, setCurrentModel] = useState<string>("anthropic:claude-opus-4-1");
  const [editingMessage, setEditingMessage] = useState<{ id: string; content: string } | undefined>(
    undefined
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef<number>(0);
  // Ref to avoid stale closures in async callbacks - always holds current autoScroll value
  const autoScrollRef = useRef<boolean>(true);
  const lastUserInteractionRef = useRef<number>(0);
  // Use a Map to maintain separate aggregators per workspace
  const aggregatorsMapRef = useRef<Map<string, StreamingMessageAggregator>>(new Map());

  // Helper to get or create aggregator for current workspace
  const getAggregator = useCallback((wsId: string): StreamingMessageAggregator => {
    if (!aggregatorsMapRef.current.has(wsId)) {
      aggregatorsMapRef.current.set(wsId, new StreamingMessageAggregator());
    }
    return aggregatorsMapRef.current.get(wsId)!;
  }, []);

  // Sync ref with state to ensure callbacks always have latest value
  useEffect(() => {
    autoScrollRef.current = autoScroll;
  }, [autoScroll]);

  const performAutoScroll = useCallback(() => {
    if (!contentRef.current) return;

    requestAnimationFrame(() => {
      // Check ref.current not state - avoids race condition where queued frames
      // execute after user scrolls up but still see old autoScroll=true
      if (contentRef.current && autoScrollRef.current) {
        contentRef.current.scrollTop = contentRef.current.scrollHeight;
      }
    });
  }, []); // No deps - ref ensures we always check current value

  // Process message and trigger UI update
  // Unified UI update function - single point of UI synchronization
  // All event handlers delegate to the aggregator then call this
  const updateUIAndScroll = useCallback(() => {
    const aggregator = getAggregator(workspaceId);
    setDisplayedMessages(aggregator.getDisplayedMessages());
    setCanInterrupt(aggregator.getActiveStreams().length > 0);
    performAutoScroll();
  }, [performAutoScroll, workspaceId, getAggregator]);

  const [loading, setLoading] = useState(false);
  const [canInterrupt, setCanInterrupt] = useState(false);

  // Handlers for editing messages
  const handleEditUserMessage = useCallback((messageId: string, content: string) => {
    setEditingMessage({ id: messageId, content });
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingMessage(undefined);
  }, []);

  // When editing, find the cutoff point but show all messages
  const editCutoffHistoryId = editingMessage
    ? (() => {
        const messageBeingEdited = displayedMessages.find(
          (msg) => msg.historyId === editingMessage.id
        );
        return messageBeingEdited?.historyId;
      })()
    : undefined;

  const messages = displayedMessages;

  useEffect(() => {
    if (!projectName || !branch || !workspaceId) return;

    let isCaughtUp = false;
    const historicalMessages: CmuxMessage[] = [];

    // Get the aggregator for this workspace
    const aggregator = getAggregator(workspaceId);

    // Load existing messages for this workspace
    setDisplayedMessages(aggregator.getDisplayedMessages());
    setCanInterrupt(aggregator.getActiveStreams().length > 0);

    // Enable auto-scroll when switching workspaces
    setAutoScroll(true);

    // Set loading state based on whether we have messages
    // This preserves streaming state when switching workspaces
    if (aggregator.hasMessages()) {
      setLoading(false); // Clear loading if we have messages
    } else {
      setLoading(true); // Show loading only if empty
    }

    // Subscribe to workspace-specific chat channel
    // This will automatically send historical messages then stream new ones
    const unsubscribeChat = window.api.workspace.onChat(
      workspaceId,
      (data: WorkspaceChatMessage) => {
        if (isCaughtUpMessage(data)) {
          // Batch-load all historical messages at once for efficiency
          if (historicalMessages.length > 0) {
            aggregator.loadHistoricalMessages(historicalMessages);
            updateUIAndScroll();
          }
          isCaughtUp = true;
          setLoading(false);
          // Scroll to bottom once caught up
          requestAnimationFrame(() => {
            if (contentRef.current) {
              contentRef.current.scrollTop = contentRef.current.scrollHeight;
            }
          });
          return;
        }

        // Handle stream errors
        if (isStreamError(data)) {
          // Notify aggregator to clean up streaming state and mark message with error
          // Error will be displayed inline as a stream-error message
          aggregator.handleStreamError(data);
          updateUIAndScroll();
          return;
        }

        // Handle delete messages (from truncate operation)
        if (isDeleteMessage(data)) {
          aggregator.handleDeleteMessage(data);
          updateUIAndScroll();
          return;
        }

        // SIMPLIFIED EVENT HANDLING
        // All complex logic lives in StreamingMessageAggregator
        // AIView only handles UI updates - separation of concerns

        // Handle streaming events with simplified delegation
        if (isStreamStart(data)) {
          aggregator.handleStreamStart(data);
          setCurrentModel(data.model);
          updateUIAndScroll();
          return;
        }

        if (isStreamDelta(data)) {
          aggregator.handleStreamDelta(data);
          updateUIAndScroll();
          return;
        }

        if (isStreamEnd(data)) {
          // Aggregator handles both active streams and reconnection cases
          aggregator.handleStreamEnd(data);
          updateUIAndScroll();
          return;
        }

        if (isStreamAbort(data)) {
          // Stream was interrupted - mark message as partial
          aggregator.handleStreamAbort(data);
          updateUIAndScroll();
          return;
        }

        // Handle tool call events with simplified delegation
        if (isToolCallStart(data)) {
          aggregator.handleToolCallStart(data);
          updateUIAndScroll();
          return;
        }

        if (isToolCallDelta(data)) {
          aggregator.handleToolCallDelta(data);
          updateUIAndScroll();
          return;
        }

        if (isToolCallEnd(data)) {
          aggregator.handleToolCallEnd(data);
          updateUIAndScroll();
          return;
        }

        // Handle reasoning events
        if (isReasoningDelta(data)) {
          console.log("[AIView] Received reasoning-delta", data);
          aggregator.handleReasoningDelta(data);
          updateUIAndScroll();
          return;
        }

        if (isReasoningEnd(data)) {
          aggregator.handleReasoningEnd(data);
          updateUIAndScroll();
          return;
        }

        // Regular messages (user messages, historical messages)
        if (!isCaughtUp) {
          // Before caught-up: collect historical messages for batch loading
          // Check if it's a CmuxMessage (has role property but no type)
          if ("role" in data && !("type" in data)) {
            historicalMessages.push(data);
          }
        } else {
          // After caught-up: handle messages normally
          aggregator.handleMessage(data);
          updateUIAndScroll();

          // Auto-scroll for new messages after caught up
          if (contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
          }
        }
      }
    );

    return () => {
      if (typeof unsubscribeChat === "function") {
        unsubscribeChat();
      }
    };
  }, [projectName, branch, workspaceId, updateUIAndScroll, getAggregator]);

  const handleMessageSent = useCallback(() => {
    // Enable auto-scroll when user sends a message
    setAutoScroll(true);
  }, []);

  const handleClearHistory = useCallback(
    async (percentage = 1.0) => {
      // Enable auto-scroll after clearing
      setAutoScroll(true);

      // Truncate history in backend (which will send DeleteMessage to update UI)
      await window.api.workspace.truncateHistory(workspaceId, percentage);
    },
    [workspaceId]
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

  // Get current aggregator
  const aggregator = getAggregator(workspaceId);

  // getAllMessages() returns cached array with stable references when state unchanged
  // The aggregator invalidates its cache on mutations, so we don't need useMemo here
  // Must be before early returns to respect React hooks rules
  const cmuxMessages = aggregator.getAllMessages();

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
              {projectName} / {branch}
            </WorkspaceTitle>
          </ViewHeader>

          <OutputContent
            ref={contentRef}
            onWheel={() => {
              lastUserInteractionRef.current = Date.now();
            }}
            onTouchMove={() => {
              lastUserInteractionRef.current = Date.now();
            }}
            onScroll={(e) => {
              const element = e.currentTarget;
              const currentScrollTop = element.scrollTop;
              const threshold = 100;
              const isAtBottom =
                element.scrollHeight - currentScrollTop - element.clientHeight < threshold;

              // Only process user-initiated scrolls (within 100ms of interaction)
              const isUserScroll = Date.now() - lastUserInteractionRef.current < 100;

              if (!isUserScroll) {
                lastScrollTopRef.current = currentScrollTop;
                return; // Ignore programmatic scrolls
              }

              // Detect scroll direction
              const isScrollingUp = currentScrollTop < lastScrollTopRef.current;
              const isScrollingDown = currentScrollTop > lastScrollTopRef.current;

              if (isScrollingUp) {
                // Always disable auto-scroll when scrolling up
                setAutoScroll(false);
              } else if (isScrollingDown && isAtBottom) {
                // Only enable auto-scroll if scrolling down AND reached the bottom
                setAutoScroll(true);
              }
              // If scrolling down but not at bottom, auto-scroll remains disabled

              // Update last scroll position
              lastScrollTopRef.current = currentScrollTop;
            }}
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
              <GlobalStreamingIndicator>streaming... hit Esc to cancel</GlobalStreamingIndicator>
            )}
          </OutputContent>

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
