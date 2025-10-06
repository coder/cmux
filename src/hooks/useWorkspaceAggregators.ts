import { useState, useEffect, useRef, useCallback } from "react";
import type { DisplayedMessage, CmuxMessage } from "@/types/message";
import type { WorkspaceMetadata } from "@/types/workspace";
import type { WorkspaceChatMessage } from "@/types/ipc";
import { StreamingMessageAggregator } from "@/utils/messages/StreamingMessageAggregator";
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

export interface WorkspaceState {
  messages: DisplayedMessage[];
  canInterrupt: boolean;
  loading: boolean;
  cmuxMessages: CmuxMessage[];
  currentModel: string;
}

/**
 * Hook to manage message aggregation and streaming state for ALL workspaces.
 *
 * This hook subscribes to chat events for all workspaces and maintains their state
 * centrally. This allows us to show streaming indicators for non-selected workspaces.
 */
export function useWorkspaceAggregators(workspaceMetadata: Map<string, WorkspaceMetadata>) {
  const aggregatorsRef = useRef<Map<string, StreamingMessageAggregator>>(new Map());
  const [streamingStates, setStreamingStates] = useState<Map<string, boolean>>(new Map());
  const [currentModels, setCurrentModels] = useState<Map<string, string>>(new Map());
  // Force re-render when messages change for the selected workspace
  const [, setUpdateCounter] = useState(0);

  // Track caught-up state per workspace
  const caughtUpRef = useRef<Map<string, boolean>>(new Map());
  // Track historical messages buffer per workspace
  const historicalMessagesRef = useRef<Map<string, CmuxMessage[]>>(new Map());

  // Get or create aggregator for a workspace
  const getAggregator = useCallback((workspaceId: string): StreamingMessageAggregator => {
    if (!aggregatorsRef.current.has(workspaceId)) {
      aggregatorsRef.current.set(workspaceId, new StreamingMessageAggregator());
    }
    return aggregatorsRef.current.get(workspaceId)!;
  }, []);

  // Get state for a specific workspace
  const getWorkspaceState = useCallback(
    (workspaceId: string): WorkspaceState => {
      const aggregator = getAggregator(workspaceId);
      const hasMessages = aggregator.hasMessages();
      const isCaughtUp = caughtUpRef.current.get(workspaceId) ?? false;

      return {
        messages: aggregator.getDisplayedMessages(),
        canInterrupt: aggregator.getActiveStreams().length > 0,
        loading: !hasMessages && !isCaughtUp,
        cmuxMessages: aggregator.getAllMessages(),
        currentModel: currentModels.get(workspaceId) ?? "claude-sonnet-4-5",
      };
    },
    [getAggregator, currentModels]
  );

  // Force update for a specific workspace (used when that workspace is selected)
  const forceUpdate = useCallback(() => {
    setUpdateCounter((c) => c + 1);
  }, []);

  // Subscribe to all workspaces
  useEffect(() => {
    const unsubscribers: Array<() => void> = [];

    for (const [, metadata] of workspaceMetadata.entries()) {
      const workspaceId = metadata.id;
      const aggregator = getAggregator(workspaceId);

      // Initialize caught-up state
      if (!caughtUpRef.current.has(workspaceId)) {
        caughtUpRef.current.set(workspaceId, false);
      }

      // Initialize historical messages buffer
      if (!historicalMessagesRef.current.has(workspaceId)) {
        historicalMessagesRef.current.set(workspaceId, []);
      }

      // Clear stale streaming state before subscribing
      aggregator.clearActiveStreams();

      // Subscribe to this workspace's chat events
      const unsubscribe = window.api.workspace.onChat(workspaceId, (data: WorkspaceChatMessage) => {
        const isCaughtUp = caughtUpRef.current.get(workspaceId) ?? false;
        const historicalMessages = historicalMessagesRef.current.get(workspaceId) ?? [];

        if (isCaughtUpMessage(data)) {
          // Batch-load all historical messages at once
          if (historicalMessages.length > 0) {
            aggregator.loadHistoricalMessages(historicalMessages);
            historicalMessagesRef.current.set(workspaceId, []);
          }
          caughtUpRef.current.set(workspaceId, true);
          // Update streaming state
          setStreamingStates((prev) =>
            new Map(prev).set(workspaceId, aggregator.getActiveStreams().length > 0)
          );
          forceUpdate();
          return;
        }

        // Handle stream errors
        if (isStreamError(data)) {
          aggregator.handleStreamError(data);
          setStreamingStates((prev) =>
            new Map(prev).set(workspaceId, aggregator.getActiveStreams().length > 0)
          );
          forceUpdate();
          return;
        }

        // Handle delete messages
        if (isDeleteMessage(data)) {
          aggregator.handleDeleteMessage(data);
          forceUpdate();
          return;
        }

        // Handle streaming events
        if (isStreamStart(data)) {
          aggregator.handleStreamStart(data);
          setCurrentModels((prev) => new Map(prev).set(workspaceId, data.model));
          setStreamingStates((prev) => new Map(prev).set(workspaceId, true));
          forceUpdate();
          return;
        }

        if (isStreamDelta(data)) {
          aggregator.handleStreamDelta(data);
          forceUpdate();
          return;
        }

        if (isStreamEnd(data)) {
          aggregator.handleStreamEnd(data);
          setStreamingStates((prev) =>
            new Map(prev).set(workspaceId, aggregator.getActiveStreams().length > 0)
          );
          forceUpdate();
          return;
        }

        if (isStreamAbort(data)) {
          aggregator.handleStreamAbort(data);
          setStreamingStates((prev) => new Map(prev).set(workspaceId, false));
          forceUpdate();
          return;
        }

        // Handle tool call events
        if (isToolCallStart(data)) {
          aggregator.handleToolCallStart(data);
          forceUpdate();
          return;
        }

        if (isToolCallDelta(data)) {
          aggregator.handleToolCallDelta(data);
          forceUpdate();
          return;
        }

        if (isToolCallEnd(data)) {
          aggregator.handleToolCallEnd(data);
          forceUpdate();
          return;
        }

        // Handle reasoning events
        if (isReasoningDelta(data)) {
          aggregator.handleReasoningDelta(data);
          forceUpdate();
          return;
        }

        if (isReasoningEnd(data)) {
          aggregator.handleReasoningEnd(data);
          forceUpdate();
          return;
        }

        // Regular messages
        if (!isCaughtUp) {
          // Before caught-up: collect historical messages
          if ("role" in data && !("type" in data)) {
            historicalMessages.push(data);
            historicalMessagesRef.current.set(workspaceId, historicalMessages);
          }
        } else {
          // After caught-up: handle messages normally
          aggregator.handleMessage(data);
          forceUpdate();
        }
      });

      unsubscribers.push(unsubscribe);
    }

    // Cleanup: unsubscribe from all workspaces
    return () => {
      unsubscribers.forEach((unsub) => {
        if (typeof unsub === "function") {
          unsub();
        }
      });
    };
  }, [workspaceMetadata, getAggregator, forceUpdate]);

  return {
    getWorkspaceState,
    streamingStates,
  };
}
