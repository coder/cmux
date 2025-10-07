import { useState, useEffect, useRef, useCallback } from "react";
import type { DisplayedMessage, CmuxMessage } from "@/types/message";
import { createCmuxMessage } from "@/types/message";
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
import { useModelLRU } from "./useModelLRU";

export interface WorkspaceState {
  messages: DisplayedMessage[];
  canInterrupt: boolean;
  isCompacting: boolean;
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
  // Force re-render when messages change for the selected workspace
  const [, setUpdateCounter] = useState(0);

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

  // Get state for a specific workspace
  const getWorkspaceState = useCallback(
    (workspaceId: string): WorkspaceState => {
      const aggregator = getAggregator(workspaceId);
      const hasMessages = aggregator.hasMessages();
      const isCaughtUp = caughtUpRef.current.get(workspaceId) ?? false;

      return {
        messages: aggregator.getDisplayedMessages(),
        canInterrupt: aggregator.getActiveStreams().length > 0,
        isCompacting: aggregator.isCompacting(),
        loading: !hasMessages && !isCaughtUp,
        cmuxMessages: aggregator.getAllMessages(),
        currentModel: aggregator.getCurrentModel() ?? "claude-sonnet-4-5",
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
          // Track model in LRU cache
          addModel(data.model);
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

          // Handle compact_summary completion - check if any tool in parts is compact_summary
          // Tool results may come in stream-end rather than as separate tool-call-end events
          if (data.parts) {
            for (const part of data.parts) {
              if (part.type === "dynamic-tool" && part.toolName === "compact_summary") {
                console.log("[useWorkspaceAggregators] Found compact_summary in stream-end parts");
                const output = part.output as { summary?: string } | undefined;
                console.log("[useWorkspaceAggregators] Tool output:", output);
                if (output?.summary) {
                  console.log(
                    "[useWorkspaceAggregators] Calling replaceChatHistory with summary from stream-end"
                  );
                  const summaryMessage = createCmuxMessage(
                    `summary-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
                    "assistant",
                    output.summary,
                    {
                      timestamp: Date.now(),
                      compacted: true,
                      model: aggregator.getCurrentModel(),
                      // Copy usage metadata so users can see tokens/costs for the compaction operation
                      usage: data.metadata.usage,
                      providerMetadata: data.metadata.providerMetadata,
                      duration: data.metadata.duration,
                      systemMessageTokens: data.metadata.systemMessageTokens,
                    }
                  );

                  void window.api.workspace.replaceChatHistory(workspaceId, summaryMessage);
                } else {
                  console.log("[useWorkspaceAggregators] No summary in tool output");
                }
                break; // Only one compact_summary per stream
              }
            }
          }

          forceUpdate();
          return;
        }

        if (isStreamAbort(data)) {
          aggregator.handleStreamAbort(data);
          forceUpdate();
          return;
        }

        // Handle tool call events
        if (isToolCallStart(data)) {
          console.log("[useWorkspaceAggregators] Tool call start:", data.toolName);
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
          console.log(
            "[useWorkspaceAggregators] Tool call end:",
            data.toolName,
            "result:",
            data.result
          );
          aggregator.handleToolCallEnd(data);

          // Note: compact_summary handling removed from tool-call-end
          // Compaction is handled in stream-end to prevent infinite loops
          // (calling replaceChatHistory during streaming causes the model to see
          // cleared history and trigger compaction again)

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
  }, [workspaceMetadata, getAggregator, forceUpdate, addModel]);

  return {
    getWorkspaceState,
  };
}
