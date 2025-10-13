import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { DisplayedMessage, CmuxMessage } from "@/types/message";
import { createCmuxMessage } from "@/types/message";
import type { WorkspaceMetadata } from "@/types/workspace";
import type { WorkspaceChatMessage } from "@/types/ipc";
import { StreamingMessageAggregator } from "@/utils/messages/StreamingMessageAggregator";
import { updatePersistedState } from "./usePersistedState";
import { getRetryStateKey } from "@/constants/storage";
import { CUSTOM_EVENTS } from "@/constants/events";
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
import { useModelLRU } from "./useModelLRU";

export interface WorkspaceState {
  messages: DisplayedMessage[];
  canInterrupt: boolean;
  isCompacting: boolean;
  loading: boolean;
  cmuxMessages: CmuxMessage[];
  currentModel: string;
  lastUserMessageAt: number | null; // Timestamp of most recent user message (null if no user messages)
}

/**
 * Hook to manage message aggregation and streaming state for ALL workspaces.
 *
 * This hook subscribes to chat events for all workspaces and maintains their state
 * centrally. This allows us to show streaming indicators for non-selected workspaces.
 */
export function useWorkspaceAggregators(workspaceMetadata: Map<string, WorkspaceMetadata>) {
  const aggregatorsRef = useRef<Map<string, StreamingMessageAggregator>>(new Map());
  // Force re-render when messages change for the selected workspace
  const [updateCounter, setUpdateCounter] = useState(0);

  // Track recently used models
  const { addModel } = useModelLRU();

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
  
  // Compaction state is managed in this hook (not in the aggregator)
  const compactingRef = useRef<Map<string, boolean>>(new Map());
  const pendingSummaryRef = useRef<Map<string, string>>(new Map());
  // Get state for a specific workspace
  const getWorkspaceState = useCallback(
    (workspaceId: string): WorkspaceState => {
      const aggregator = getAggregator(workspaceId);
      const hasMessages = aggregator.hasMessages();
      const isCaughtUp = caughtUpRef.current.get(workspaceId) ?? false;
      const activeStreams = aggregator.getActiveStreams();

      // Get most recent user message timestamp (persisted, survives restarts)
      // Using user messages instead of assistant messages avoids constant reordering
      // when multiple concurrent streams are running
      const messages = aggregator.getAllMessages();
      const lastUserMsg = [...messages]
        .reverse()
        .find((m) => m.role === "user" && m.metadata?.timestamp);
      const lastUserMessageAt = lastUserMsg?.metadata?.timestamp ?? null;

      const isCompacting = compactingRef.current.get(workspaceId) ?? false;

      return {
        messages: aggregator.getDisplayedMessages(),
        canInterrupt: activeStreams.length > 0,
        isCompacting,
        loading: !hasMessages && !isCaughtUp,
        cmuxMessages: aggregator.getAllMessages(),
        currentModel: aggregator.getCurrentModel() ?? "claude-sonnet-4-5",
        lastUserMessageAt,
      };
    },
    [getAggregator]
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
          forceUpdate();
          return;
        }

        // Handle stream errors
        if (isStreamError(data)) {
          aggregator.handleStreamError(data);
          // Clear compaction state on error
          pendingSummaryRef.current.delete(workspaceId);
          compactingRef.current.delete(workspaceId);
          forceUpdate();

          // Trigger resume check
          window.dispatchEvent(
            new CustomEvent(CUSTOM_EVENTS.RESUME_CHECK_REQUESTED, {
              detail: { workspaceId },
            })
          );
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
          // Track model in LRU cache
          addModel(data.model);
          // Clear retry state on successful stream start (fixes retry barrier persistence)
          updatePersistedState(getRetryStateKey(workspaceId), {
            attempt: 0,
            retryStartTime: Date.now(),
          });
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
          // Clear token state after stream completes
          aggregator.clearTokenState(data.messageId);

          // Prefer pendingSummaryRef if present; fallback to scanning parts if we were compacting
          const pending = pendingSummaryRef.current.get(workspaceId);
          const isCompacting = compactingRef.current.get(workspaceId) ?? false;
          if (pending) {
            const summaryMessage = createCmuxMessage(
              `summary-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
              "assistant",
              pending,
              {
                timestamp: Date.now(),
                compacted: true,
                model: aggregator.getCurrentModel(),
                usage: data.metadata.usage,
                providerMetadata: data.metadata.providerMetadata,
                duration: data.metadata.duration,
                systemMessageTokens: data.metadata.systemMessageTokens,
              }
            );
            void window.api.workspace.replaceChatHistory(workspaceId, summaryMessage);
            pendingSummaryRef.current.delete(workspaceId);
          } else if (isCompacting && data.parts) {
            // Fallback: scan parts for compact_summary only if we were compacting
            for (const part of data.parts) {
              if (part.type === "dynamic-tool" && part.toolName === "compact_summary") {
                const output = part.output as { summary?: string } | undefined;
                if (output?.summary) {
                  const summaryMessage = createCmuxMessage(
                    `summary-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
                    "assistant",
                    output.summary,
                    {
                      timestamp: Date.now(),
                      compacted: true,
                      model: aggregator.getCurrentModel(),
                      usage: data.metadata.usage,
                      providerMetadata: data.metadata.providerMetadata,
                      duration: data.metadata.duration,
                      systemMessageTokens: data.metadata.systemMessageTokens,
                    }
                  );
                  void window.api.workspace.replaceChatHistory(workspaceId, summaryMessage);
                }
                break; // Only one compact_summary per stream
              }
            }
          }
          // Clear compaction state at stream end
          compactingRef.current.delete(workspaceId);

          forceUpdate();
          return;
        }

        if (isStreamAbort(data)) {
          // Clear token state on abort
          aggregator.clearTokenState(data.messageId);
          aggregator.handleStreamAbort(data);
          // Clear compaction state on abort
          pendingSummaryRef.current.delete(workspaceId);
          compactingRef.current.delete(workspaceId);
          forceUpdate();

          // Trigger resume check
          window.dispatchEvent(
            new CustomEvent(CUSTOM_EVENTS.RESUME_CHECK_REQUESTED, {
              detail: { workspaceId },
            })
          );
          return;
        }
        // Handle tool call events
        if (isToolCallStart(data)) {
          aggregator.handleToolCallStart(data);
          if (data.toolName === "compact_summary") {
            compactingRef.current.set(workspaceId, true);
          }
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
          if (data.toolName === "compact_summary") {
            const result = data.result as { summary?: string } | undefined;
            if (result?.summary) {
              pendingSummaryRef.current.set(workspaceId, result.summary);
              // If for some reason there is no active stream (reconnection case), apply immediately
              if (aggregator.getActiveStreams().length === 0) {
                const summaryMessage = createCmuxMessage(
                  `summary-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
                  "assistant",
                  result.summary,
                  {
                    timestamp: Date.now(),
                    compacted: true,
                    model: aggregator.getCurrentModel(),
                  }
                );
                void window.api.workspace.replaceChatHistory(workspaceId, summaryMessage);
                pendingSummaryRef.current.delete(workspaceId);
                compactingRef.current.delete(workspaceId);
              }
            }
          }
          // Finalization generally occurs at stream-end
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


        // Handle tool call events

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
  }, [workspaceMetadata, getAggregator, forceUpdate, addModel]);

  // Build workspaceStates map for consumers that need all states
  // Key by metadata.id (short format like 'cmux-md-toggles') to match localStorage keys
  // Memoized to prevent unnecessary re-renders of consumers (e.g., ProjectSidebar sorting)
  // Updates when messages change (updateCounter) or workspaces are added/removed (workspaceMetadata)
  const workspaceStates = useMemo(() => {
    const states = new Map<string, WorkspaceState>();
    for (const [_key, metadata] of workspaceMetadata) {
      states.set(metadata.id, getWorkspaceState(metadata.id));
    }
    return states;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceMetadata, getWorkspaceState, updateCounter]);

  // Extract recency timestamps for sorting - only updates when timestamps actually change
  // This prevents unnecessary sort recomputation when unrelated workspace state changes
  const workspaceRecencyRef = useRef<Record<string, number>>({});
  const workspaceRecency = useMemo(() => {
    const timestamps: Record<string, number> = {};
    for (const [id, state] of workspaceStates) {
      if (state.lastUserMessageAt !== null) {
        timestamps[id] = state.lastUserMessageAt;
      }
    }

    // Only return new object if timestamps actually changed
    const prev = workspaceRecencyRef.current;
    const prevKeys = Object.keys(prev);
    const newKeys = Object.keys(timestamps);

    if (
      prevKeys.length === newKeys.length &&
      prevKeys.every((key) => prev[key] === timestamps[key])
    ) {
      return prev; // No change, return previous reference
    }

    workspaceRecencyRef.current = timestamps;
    return timestamps;
  }, [workspaceStates]);

  return {
    getWorkspaceState,
    getAggregator,
    workspaceStates,
    workspaceRecency,
    forceUpdate,
  };
}
