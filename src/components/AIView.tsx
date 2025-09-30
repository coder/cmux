import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import styled from "@emotion/styled";
import { MessageRenderer } from "./Messages/MessageRenderer";
import { ChatInput } from "./ChatInput";
import { ErrorMessage } from "./ErrorMessage";
import { ChatMetaSidebar } from "./ChatMetaSidebar";
import { DisplayedMessage } from "../types/message";
import { StreamingMessageAggregator } from "../utils/StreamingMessageAggregator";
import { DebugProvider, useDebugMode } from "../contexts/DebugContext";
import { ChatProvider } from "../contexts/ChatContext";
import {
  WorkspaceChatMessage,
  isCaughtUpMessage,
  isStreamError,
  isStreamStart,
  isStreamDelta,
  isStreamEnd,
  isToolCallStart,
  isToolCallDelta,
  isToolCallEnd,
} from "../types/ipc";

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
  overflow: hidden;
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

interface AIViewProps {
  workspaceId: string;
  projectName: string;
  branch: string;
  className?: string;
}

const AIViewInner: React.FC<AIViewProps> = ({ workspaceId, projectName, branch, className }) => {
  const [displayedMessages, setDisplayedMessages] = useState<DisplayedMessage[]>([]);
  const [isCompacting] = useState(false);
  const { debugMode, setDebugMode } = useDebugMode(); // Use context instead of local state
  const [autoScroll, setAutoScroll] = useState(true);
  const [errorMessage, setErrorMessage] = useState<{
    title?: string;
    message: string;
    details?: string;
  } | null>(null);
  const [currentModel, setCurrentModel] = useState<string>("anthropic:claude-opus-4-1");
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
    performAutoScroll();
  }, [performAutoScroll, workspaceId, getAggregator]);

  const [loading, setLoading] = useState(false);

  // Messages are already sorted by sequenceNumber from getDisplayedMessages
  const messages = displayedMessages;

  useEffect(() => {
    if (!projectName || !branch || !workspaceId) return;

    let isCaughtUp = false;

    // Get the aggregator for this workspace
    const aggregator = getAggregator(workspaceId);

    // Load existing messages for this workspace
    setDisplayedMessages(aggregator.getDisplayedMessages());

    // Enable auto-scroll when switching workspaces
    setAutoScroll(true);

    // Show loading state until caught up
    setLoading(true);

    // Subscribe to workspace-specific chat channel
    // This will automatically send historical messages then stream new ones
    const unsubscribeChat = window.api.workspace.onChat(
      workspaceId,
      (data: WorkspaceChatMessage) => {
        if (isCaughtUpMessage(data)) {
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
          // Display error in UI instead of console
          if (data.errorType === "authentication") {
            setErrorMessage({
              title: "Authentication Error",
              message: "Authentication error during streaming!",
              details: "Please check your ANTHROPIC_API_KEY environment variable.",
            });
          } else {
            setErrorMessage({
              title: "Stream Error",
              message: data.error,
              details: `Error type: ${data.errorType}`,
            });
          }

          // Don't try to render this as a message
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

        // Regular messages (user messages, historical messages)
        aggregator.handleMessage(data);
        updateUIAndScroll();

        // Only auto-scroll for new messages after caught up
        if (isCaughtUp) {
          // Needs to call perform scroll directly, not through updateUIAndScroll
          // to avoid stale closure issues during reconnection
          if (contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
          }
        }
      }
    );

    // Subscribe to workspace-specific clear channel
    const unsubscribeClear = window.api.workspace.onClear(workspaceId, () => {
      // Clear the UI when we receive a clear event
      setDisplayedMessages([]);
      aggregator.clear();
    });

    return () => {
      if (typeof unsubscribeChat === "function") {
        unsubscribeChat();
      }
      if (typeof unsubscribeClear === "function") {
        unsubscribeClear();
      }
    };
  }, [projectName, branch, workspaceId, updateUIAndScroll, getAggregator]);

  const handleMessageSent = useCallback(() => {
    // Enable auto-scroll when user sends a message
    setAutoScroll(true);
  }, []);

  const handleClearHistory = useCallback(async () => {
    // Clear UI immediately
    setDisplayedMessages([]);
    const aggregator = getAggregator(workspaceId);
    aggregator.clear();

    // Enable auto-scroll after clearing
    setAutoScroll(true);

    // Clear history in backend
    await window.api.workspace.clearHistory(workspaceId);
  }, [workspaceId, getAggregator]);

  const handleProviderConfig = useCallback(
    async (provider: string, keyPath: string[], value: string) => {
      const result = await window.api.providers.setProviderConfig(provider, keyPath, value);
      if (!result.success) {
        throw new Error(result.error);
      }
    },
    []
  );

  // Memoize cmuxMessages to only recalculate when displayVersion changes
  // Must be before early returns to respect React hooks rules
  const cmuxMessages = useMemo(
    () => getAggregator(workspaceId).getAllMessages(),
    [workspaceId, getAggregator(workspaceId).getDisplayVersion()]
  );

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
              messages.map((msg) => <MessageRenderer key={msg.id} message={msg} />)
            )}
            {errorMessage && (
              <ErrorMessage
                title={errorMessage.title}
                message={errorMessage.message}
                details={errorMessage.details}
              />
            )}
          </OutputContent>

          <ChatInput
            workspaceId={workspaceId}
            onMessageSent={handleMessageSent}
            onClearHistory={handleClearHistory}
            onProviderConfig={handleProviderConfig}
            debugMode={debugMode}
            onDebugModeChange={setDebugMode}
            disabled={!projectName || !branch}
            isCompacting={isCompacting}
          />
        </ChatArea>

        <ChatMetaSidebar workspaceId={workspaceId} />
      </ViewContainer>
    </ChatProvider>
  );
};

// Wrapper component that provides the debug context
export const AIView: React.FC<AIViewProps> = (props) => {
  return (
    <DebugProvider>
      <AIViewInner {...props} />
    </DebugProvider>
  );
};
