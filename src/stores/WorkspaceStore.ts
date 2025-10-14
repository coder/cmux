import type { CmuxMessage, DisplayedMessage } from "@/types/message";
import { createCmuxMessage } from "@/types/message";
import type { WorkspaceMetadata } from "@/types/workspace";
import type { WorkspaceChatMessage } from "@/types/ipc";
import { StreamingMessageAggregator } from "@/utils/messages/StreamingMessageAggregator";
import { updatePersistedState } from "@/hooks/usePersistedState";
import { getRetryStateKey } from "@/constants/storage";
import { CUSTOM_EVENTS } from "@/constants/events";
import { useShallow } from "zustand/react/shallow";
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
  isCompacting: boolean;
  loading: boolean;
  cmuxMessages: CmuxMessage[];
  currentModel: string;
  recencyTimestamp: number | null;
}

/**
 * Subset of WorkspaceState needed for sidebar display.
 * Subscribing to only these fields prevents re-renders when messages update.
 */
export interface WorkspaceSidebarState {
  canInterrupt: boolean;
  currentModel: string;
  recencyTimestamp: number | null;
}

/**
 * External store for workspace aggregators and streaming state.
 *
 * This store lives outside React's lifecycle and manages all workspace
 * message aggregation and IPC subscriptions. Components subscribe to
 * specific workspaces via useSyncExternalStore, ensuring only relevant
 * components re-render when workspace state changes.
 */
export class WorkspaceStore {
  private aggregators = new Map<string, StreamingMessageAggregator>();
  private listeners = new Set<() => void>();
  private ipcUnsubscribers = new Map<string, () => void>();
  private caughtUp = new Map<string, boolean>();
  private historicalMessages = new Map<string, CmuxMessage[]>();

  // Cache for stable references - only return new object when values change
  private stateCache = new Map<string, WorkspaceState>();
  private allStatesCache: Map<string, WorkspaceState> | null = null;
  private recencyCache: { value: Record<string, number>; hash: string } | null = null;

  // Track model usage (injected dependency for useModelLRU integration)
  private readonly onModelUsed?: (model: string) => void;

  constructor(onModelUsed?: (model: string) => void) {
    this.onModelUsed = onModelUsed;
  }

  /**
   * Subscribe to store changes. Returns unsubscribe function.
   * All listeners are called on any workspace update (React handles equality checks).
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Get state for a specific workspace.
   * Returns cached reference if state hasn't changed (prevents unnecessary re-renders).
   */
  getWorkspaceState(workspaceId: string): WorkspaceState {
    const aggregator = this.getOrCreateAggregator(workspaceId);
    const hasMessages = aggregator.hasMessages();
    const isCaughtUp = this.caughtUp.get(workspaceId) ?? false;
    const activeStreams = aggregator.getActiveStreams();

    // Compute recency timestamp
    const messages = aggregator.getAllMessages();
    const lastUserMsg = [...messages]
      .reverse()
      .find((m) => m.role === "user" && m.metadata?.timestamp);

    let recencyTimestamp: number | null = null;
    if (lastUserMsg?.metadata?.timestamp) {
      recencyTimestamp = lastUserMsg.metadata.timestamp;
    } else {
      const lastCompactedMsg = [...messages]
        .reverse()
        .find((m) => m.metadata?.compacted === true && m.metadata?.timestamp);
      if (lastCompactedMsg?.metadata?.timestamp) {
        recencyTimestamp = lastCompactedMsg.metadata.timestamp;
      }
    }

    const currentState: WorkspaceState = {
      messages: aggregator.getDisplayedMessages(),
      canInterrupt: activeStreams.length > 0,
      isCompacting: aggregator.isCompacting(),
      loading: !hasMessages && !isCaughtUp,
      cmuxMessages: aggregator.getAllMessages(),
      currentModel: aggregator.getCurrentModel() ?? "claude-sonnet-4-5",
      recencyTimestamp,
    };

    // Check cache for stable reference
    const cached = this.stateCache.get(workspaceId);
    if (cached && this.statesEqual(cached, currentState)) {
      return cached;
    }

    this.stateCache.set(workspaceId, currentState);
    return currentState;
  }

  /**
   * Get all workspace states as a Map.
   * Used by components that need full state (e.g., ProjectSidebar).
   */
  getAllStates(): Map<string, WorkspaceState> {
    // Check if cache is still valid
    if (this.allStatesCache) {
      // Verify cache has same keys
      if (this.allStatesCache.size === this.aggregators.size) {
        let allMatch = true;
        for (const workspaceId of this.aggregators.keys()) {
          if (!this.allStatesCache.has(workspaceId)) {
            allMatch = false;
            break;
          }
          // getWorkspaceState returns cached reference if unchanged
          const currentState = this.getWorkspaceState(workspaceId);
          const cachedState = this.allStatesCache.get(workspaceId);
          if (currentState !== cachedState) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) {
          return this.allStatesCache;
        }
      }
    }

    // Cache invalid - rebuild
    const states = new Map<string, WorkspaceState>();
    for (const workspaceId of this.aggregators.keys()) {
      states.set(workspaceId, this.getWorkspaceState(workspaceId));
    }
    this.allStatesCache = states;
    return states;
  }

  /**
   * Get recency timestamps for all workspaces (for sorting).
   * Returns cached object with stable identity if values haven't changed.
   */
  getWorkspaceRecency(): Record<string, number> {
    const timestamps: Record<string, number> = {};
    for (const workspaceId of this.aggregators.keys()) {
      const state = this.getWorkspaceState(workspaceId);
      if (state.recencyTimestamp !== null) {
        timestamps[workspaceId] = state.recencyTimestamp;
      }
    }

    // Create hash for comparison
    const hash = JSON.stringify(timestamps);
    if (this.recencyCache && this.recencyCache.hash === hash) {
      return this.recencyCache.value;
    }

    this.recencyCache = { value: timestamps, hash };
    return timestamps;
  }

  /**
   * Get aggregator for a workspace (used by components that need direct access).
   */
  getAggregator(workspaceId: string): StreamingMessageAggregator {
    return this.getOrCreateAggregator(workspaceId);
  }

  /**
   * Add a workspace and subscribe to its IPC events.
   */
  addWorkspace(metadata: WorkspaceMetadata): void {
    const workspaceId = metadata.id;

    // Skip if already subscribed
    if (this.ipcUnsubscribers.has(workspaceId)) {
      return;
    }

    const aggregator = this.getOrCreateAggregator(workspaceId);

    // Initialize state
    if (!this.caughtUp.has(workspaceId)) {
      this.caughtUp.set(workspaceId, false);
    }
    if (!this.historicalMessages.has(workspaceId)) {
      this.historicalMessages.set(workspaceId, []);
    }

    // Clear stale streaming state
    aggregator.clearActiveStreams();

    // Subscribe to IPC events
    // Wrap in queueMicrotask to ensure IPC events don't update during React render
    const unsubscribe = window.api.workspace.onChat(workspaceId, (data: WorkspaceChatMessage) => {
      queueMicrotask(() => {
        this.handleChatMessage(workspaceId, data);
      });
    });

    this.ipcUnsubscribers.set(workspaceId, unsubscribe);
  }

  /**
   * Remove a workspace and clean up subscriptions.
   */
  removeWorkspace(workspaceId: string): void {
    // Unsubscribe from IPC
    const unsubscribe = this.ipcUnsubscribers.get(workspaceId);
    if (unsubscribe) {
      unsubscribe();
      this.ipcUnsubscribers.delete(workspaceId);
    }

    // Clean up state
    this.aggregators.delete(workspaceId);
    this.caughtUp.delete(workspaceId);
    this.historicalMessages.delete(workspaceId);
    this.stateCache.delete(workspaceId);

    this.emit();
  }

  /**
   * Sync workspaces with metadata - add new, remove deleted.
   */
  syncWorkspaces(workspaceMetadata: Map<string, WorkspaceMetadata>): void {
    const metadataIds = new Set(Array.from(workspaceMetadata.values()).map((m) => m.id));
    const currentIds = new Set(this.ipcUnsubscribers.keys());

    // Add new workspaces
    for (const metadata of workspaceMetadata.values()) {
      if (!currentIds.has(metadata.id)) {
        this.addWorkspace(metadata);
      }
    }

    // Remove deleted workspaces
    for (const workspaceId of currentIds) {
      if (!metadataIds.has(workspaceId)) {
        this.removeWorkspace(workspaceId);
      }
    }
  }

  /**
   * Cleanup all subscriptions (call on unmount).
   */
  dispose(): void {
    for (const unsubscribe of this.ipcUnsubscribers.values()) {
      unsubscribe();
    }
    this.ipcUnsubscribers.clear();
    this.aggregators.clear();
    this.caughtUp.clear();
    this.historicalMessages.clear();
    this.stateCache.clear();
    this.listeners.clear();
  }

  // Private methods

  private getOrCreateAggregator(workspaceId: string): StreamingMessageAggregator {
    if (!this.aggregators.has(workspaceId)) {
      this.aggregators.set(workspaceId, new StreamingMessageAggregator());
    }
    return this.aggregators.get(workspaceId)!;
  }

  private emit(): void {
    // Notify all listeners synchronously (required by useSyncExternalStore)
    // React handles equality checks via getSnapshot
    // IPC handlers use queueMicrotask to prevent updates during render
    this.listeners.forEach((listener) => listener());
  }

  private statesEqual(a: WorkspaceState, b: WorkspaceState): boolean {
    // Compare primitive fields
    if (
      a.canInterrupt !== b.canInterrupt ||
      a.isCompacting !== b.isCompacting ||
      a.loading !== b.loading ||
      a.currentModel !== b.currentModel ||
      a.recencyTimestamp !== b.recencyTimestamp
    ) {
      return false;
    }

    // Compare arrays by length and reference equality of elements
    // (aggregator returns new arrays but reuses message objects)
    if (a.messages.length !== b.messages.length) {
      return false;
    }
    for (let i = 0; i < a.messages.length; i++) {
      if (a.messages[i] !== b.messages[i]) {
        return false;
      }
    }

    if (a.cmuxMessages.length !== b.cmuxMessages.length) {
      return false;
    }
    for (let i = 0; i < a.cmuxMessages.length; i++) {
      if (a.cmuxMessages[i] !== b.cmuxMessages[i]) {
        return false;
      }
    }

    return true;
  }

  private handleChatMessage(workspaceId: string, data: WorkspaceChatMessage): void {
    const aggregator = this.getOrCreateAggregator(workspaceId);
    const isCaughtUp = this.caughtUp.get(workspaceId) ?? false;
    const historicalMsgs = this.historicalMessages.get(workspaceId) ?? [];

    if (isCaughtUpMessage(data)) {
      if (historicalMsgs.length > 0) {
        aggregator.loadHistoricalMessages(historicalMsgs);
        this.historicalMessages.set(workspaceId, []);
      }
      this.caughtUp.set(workspaceId, true);
      this.emit();
      return;
    }

    if (isStreamError(data)) {
      aggregator.handleStreamError(data);
      this.emit();
      window.dispatchEvent(
        new CustomEvent(CUSTOM_EVENTS.RESUME_CHECK_REQUESTED, {
          detail: { workspaceId },
        })
      );
      return;
    }

    if (isDeleteMessage(data)) {
      aggregator.handleDeleteMessage(data);
      this.emit();
      return;
    }

    if (isStreamStart(data)) {
      aggregator.handleStreamStart(data);
      if (this.onModelUsed) {
        this.onModelUsed(data.model);
      }
      updatePersistedState(getRetryStateKey(workspaceId), {
        attempt: 0,
        retryStartTime: Date.now(),
      });
      this.emit();
      return;
    }

    if (isStreamDelta(data)) {
      aggregator.handleStreamDelta(data);
      this.emit();
      return;
    }

    if (isStreamEnd(data)) {
      aggregator.handleStreamEnd(data);
      aggregator.clearTokenState(data.messageId);

      // Handle compact_summary completion
      if (data.parts) {
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

              void (async () => {
                try {
                  await window.api.workspace.replaceChatHistory(workspaceId, summaryMessage);
                } catch (error) {
                  console.error("[WorkspaceStore] Failed to replace history:", error);
                } finally {
                  this.emit();
                }
              })();
              return;
            }
            break;
          }
        }
      }

      this.emit();
      return;
    }

    if (isStreamAbort(data)) {
      aggregator.clearTokenState(data.messageId);
      aggregator.handleStreamAbort(data);
      this.emit();
      window.dispatchEvent(
        new CustomEvent(CUSTOM_EVENTS.RESUME_CHECK_REQUESTED, {
          detail: { workspaceId },
        })
      );
      return;
    }

    if (isToolCallStart(data)) {
      aggregator.handleToolCallStart(data);
      this.emit();
      return;
    }

    if (isToolCallDelta(data)) {
      aggregator.handleToolCallDelta(data);
      this.emit();
      return;
    }

    if (isToolCallEnd(data)) {
      aggregator.handleToolCallEnd(data);
      this.emit();
      return;
    }

    if (isReasoningDelta(data)) {
      aggregator.handleReasoningDelta(data);
      this.emit();
      return;
    }

    if (isReasoningEnd(data)) {
      aggregator.handleReasoningEnd(data);
      this.emit();
      return;
    }

    // Regular messages
    if (!isCaughtUp) {
      if ("role" in data && !("type" in data)) {
        historicalMsgs.push(data);
        this.historicalMessages.set(workspaceId, historicalMsgs);
      }
    } else {
      aggregator.handleMessage(data);
      this.emit();
    }
  }
}

// ============================================================================
// Zustand Integration
// ============================================================================

import { create } from "zustand";

interface WorkspaceStoreState {
  // The underlying store instance
  store: WorkspaceStore;

  // Trigger for subscribers (increment to notify changes)
  version: number;
}

/**
 * Zustand wrapper around WorkspaceStore.
 *
 * Benefits:
 * - Automatic subscription management
 * - Selector-based rendering (only re-render when selector result changes)
 * - Simpler hook API
 *
 * The WorkspaceStore class handles the complex IPC and aggregator logic.
 * Zustand handles the React integration.
 */
export const useWorkspaceStoreZustand = create<WorkspaceStoreState>((set) => {
  const store = new WorkspaceStore(() => {
    // Model tracking callback - can hook into other systems if needed
  });

  // Subscribe to store changes and increment version to trigger React updates
  store.subscribe(() => {
    set((state) => ({ version: state.version + 1 }));
  });

  return {
    store,
    version: 0,
  };
});

/**
 * Hook to get state for a specific workspace.
 * Only re-renders when THIS workspace's state changes.
 */
export function useWorkspaceState(workspaceId: string): WorkspaceState {
  return useWorkspaceStoreZustand(
    (state) => state.store.getWorkspaceState(workspaceId)
    // Zustand's shallow comparison works because getWorkspaceState returns cached references
  );
}

/**
 * Hook to access the raw store for imperative operations.
 */
export function useWorkspaceStoreRaw(): WorkspaceStore {
  return useWorkspaceStoreZustand((state) => state.store);
}

/**
 * Hook to get workspace recency timestamps.
 */
export function useWorkspaceRecency(): Record<string, number> {
  return useWorkspaceStoreZustand((state) => state.store.getWorkspaceRecency());
}

/**
 * Hook to get sidebar-specific state for a workspace.
 * Only re-renders when sidebar-relevant fields change (not on every message).
 */
export function useWorkspaceSidebarState(workspaceId: string): WorkspaceSidebarState {
  return useWorkspaceStoreZustand(
    useShallow((state) => {
      const fullState = state.store.getWorkspaceState(workspaceId);
      return {
        canInterrupt: fullState.canInterrupt,
        currentModel: fullState.currentModel,
        recencyTimestamp: fullState.recencyTimestamp,
      };
    })
  );
}

/**
 * Hook to get an aggregator for a workspace.
 */
export function useWorkspaceAggregator(workspaceId: string) {
  const store = useWorkspaceStoreRaw();
  return store.getAggregator(workspaceId);
}
