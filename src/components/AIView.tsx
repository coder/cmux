import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import styled from "@emotion/styled";
import { MessageRenderer } from "./Messages/MessageRenderer";
import { ChatInput } from "./ChatInput";
import { ErrorMessage } from "./ErrorMessage";
import { CmuxMessage } from "../types/message";
import { StreamingMessageAggregator } from "../utils/StreamingMessageAggregator";
import { DebugProvider, useDebugMode } from "../contexts/DebugContext";
import {
  WorkspaceChatMessage,
  isCaughtUpMessage,
  isStreamError,
  isStreamStart,
  isStreamDelta,
  isStreamEnd,
} from "../types/ipc";
import { createCmuxMessage } from "../types/message";

// StreamingMessageAggregator is now imported from utils

const ViewContainer = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #d4d4d4;
  font-family: "Monaco", "Menlo", "Ubuntu Mono", monospace;
  font-size: 12px;
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
  const [uiMessageMap, setUIMessageMap] = useState<Map<string, CmuxMessage>>(new Map());
  const [isCompacting] = useState(false);
  const { debugMode, setDebugMode } = useDebugMode(); // Use context instead of local state
  const [autoScroll, setAutoScroll] = useState(true);
  const [errorMessage, setErrorMessage] = useState<{
    title?: string;
    message: string;
    details?: string;
  } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastScrollTopRef = useRef<number>(0);
  // Ref to avoid stale closures in async callbacks - always holds current autoScroll value
  const autoScrollRef = useRef<boolean>(true);
  const lastUserInteractionRef = useRef<number>(0);
  const aggregatorRef = useRef<StreamingMessageAggregator>(new StreamingMessageAggregator());

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
  const processMessage = useCallback(
    (message: CmuxMessage) => {
      aggregatorRef.current.addMessage(message);
      // Force re-render by setting messages directly from aggregator
      setUIMessageMap(new Map(aggregatorRef.current.getAllMessages().map((msg) => [msg.id, msg])));
      // Auto-scroll if enabled
      performAutoScroll();
    },
    [performAutoScroll]
  );

  const [loading, setLoading] = useState(false);

  // Computed UI messages array derived from uiMessageMap
  const messages = useMemo(() => {
    return Array.from(uiMessageMap.values()).sort((a, b) => {
      // Handle missing cmuxMeta gracefully for backward compatibility
      const aSeq = a.metadata?.sequenceNumber ?? 0;
      const bSeq = b.metadata?.sequenceNumber ?? 0;
      return aSeq - bSeq;
    });
  }, [uiMessageMap]);

  useEffect(() => {
    if (!projectName || !branch || !workspaceId) return;

    let isCaughtUp = false;

    // Clear messages when switching workspaces
    setUIMessageMap(new Map());
    aggregatorRef.current.clear();

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

        // Handle streaming events
        if (isStreamStart(data)) {
          aggregatorRef.current.startStreaming(data.messageId);
          // Force re-render with updated messages
          setUIMessageMap(
            new Map(aggregatorRef.current.getAllMessages().map((msg) => [msg.id, msg]))
          );
          performAutoScroll();
          return;
        }

        if (isStreamDelta(data)) {
          // Find the active stream for this messageId
          const activeStream = aggregatorRef.current
            .getActiveStreams()
            .find((s) => s.messageId === data.messageId);
          if (activeStream) {
            aggregatorRef.current.updateStreaming(activeStream.streamingId, data.delta);
            // Force re-render with updated messages
            setUIMessageMap(
              new Map(aggregatorRef.current.getAllMessages().map((msg) => [msg.id, msg]))
            );
            performAutoScroll();
          }
          return;
        }

        if (isStreamEnd(data)) {
          // Find and finish the active stream
          const activeStream = aggregatorRef.current
            .getActiveStreams()
            .find((s) => s.messageId === data.messageId);
          if (activeStream) {
            // Finish streaming with the final content from backend
            aggregatorRef.current.finishStreaming(activeStream.streamingId, data.content);
          } else {
            // If no active stream (e.g., reconnection), create the final message directly
            const finalMessage = createCmuxMessage(
              data.messageId,
              "assistant",
              data.content || "",
              {
                sequenceNumber: 0,
                tokens: data.usage?.totalTokens,
              }
            );
            aggregatorRef.current.addMessage(finalMessage);
          }

          // Force re-render with updated messages
          setUIMessageMap(
            new Map(aggregatorRef.current.getAllMessages().map((msg) => [msg.id, msg]))
          );
          performAutoScroll();
          return;
        }

        // Regular messages (user messages, historical messages)
        processMessage(data);

        // Only auto-scroll for new messages after caught up
        if (isCaughtUp) {
          performAutoScroll();
        }
      }
    );

    // Subscribe to workspace-specific clear channel
    const unsubscribeClear = window.api.workspace.onClear(workspaceId, () => {
      // Clear the UI when we receive a clear event
      setUIMessageMap(new Map());
      aggregatorRef.current.clear();
    });

    return () => {
      if (typeof unsubscribeChat === "function") {
        unsubscribeChat();
      }
      if (typeof unsubscribeClear === "function") {
        unsubscribeClear();
      }
    };
  }, [projectName, branch, workspaceId, processMessage, performAutoScroll]);

  const handleMessageSent = useCallback(() => {
    // Enable auto-scroll when user sends a message
    setAutoScroll(true);
  }, []);

  const handleClearHistory = useCallback(async () => {
    // Clear UI immediately
    setUIMessageMap(new Map());
    aggregatorRef.current.clear();

    // Enable auto-scroll after clearing
    setAutoScroll(true);

    // Clear history in backend
    await window.api.workspace.clearHistory(workspaceId);
  }, [workspaceId]);

  const handleProviderConfig = useCallback(
    async (provider: string, keyPath: string[], value: string) => {
      const result = await window.api.providers.setProviderConfig(provider, keyPath, value);
      if (!result.success) {
        throw new Error(result.error);
      }
    },
    []
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
    <ViewContainer className={className}>
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
    </ViewContainer>
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
