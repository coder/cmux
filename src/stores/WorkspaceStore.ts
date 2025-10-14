import type { CmuxMessage, DisplayedMessage } from "@/types/message";
import { createCmuxMessage } from "@/types/message";
import type { WorkspaceMetadata } from "@/types/workspace";
import type { WorkspaceChatMessage } from "@/types/ipc";
import { StreamingMessageAggregator } from "@/utils/messages/StreamingMessageAggregator";
import { updatePersistedState } from "@/hooks/usePersistedState";
import { getRetryStateKey } from "@/constants/storage";
import { CUSTOM_EVENTS } from "@/constants/events";
import { useSyncExternalStore } from "react";
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
import { MapStore } from "./MapStore";

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
 * Derived state values stored in the derived MapStore.
 */
type DerivedState = Map<string, WorkspaceState> | Record<string, number>;

/**
 * External store for workspace aggregators and streaming state.
 *
 * This store lives outside React's lifecycle and manages all workspace
 * message aggregation and IPC subscriptions. Components subscribe to
 * specific workspaces via useSyncExternalStore, ensuring only relevant
 * components re-render when workspace state changes.
 */
export class WorkspaceStore {
  // Per-workspace state (lazy computed on get)
  private states = new MapStore<string, WorkspaceState>();

  // Derived aggregate state (computed from multiple workspaces)
  private derived = new MapStore<string, DerivedState>();

  // Supporting data structures
  private aggregators = new Map<string, StreamingMessageAggregator>();
  private ipcUnsubscribers = new Map<string, () => void>();
  private caughtUp = new Map<string, boolean>();
  private historicalMessages = new Map<string, CmuxMessage[]>();

  // Cache of last known recency per workspace (for change detection)
  private recencyCache = new Map<string, number | null>();

  // Track model usage (injected dependency for useModelLRU integration)
  private readonly onModelUsed?: (model: string) => void;

  constructor(onModelUsed?: (model: string) => void) {
    this.onModelUsed = onModelUsed;

    // Auto-invalidate derived state when any workspace changes
    this.states.subscribeAny(() => {
      this.derived.bump("all-states");
      this.checkAndBumpRecencyIfChanged();
    });
  }

  /**
   * Check if any workspace's recency changed and bump global recency if so.
   * Uses cached recency values from aggregators for O(1) comparison per workspace.
   */
  private checkAndBumpRecencyIfChanged(): void {
    let recencyChanged = false;

    for (const workspaceId of this.aggregators.keys()) {
      const aggregator = this.aggregators.get(workspaceId)!;
      const currentRecency = aggregator.getRecencyTimestamp();
      const cachedRecency = this.recencyCache.get(workspaceId);

      if (currentRecency !== cachedRecency) {
        this.recencyCache.set(workspaceId, currentRecency);
        recencyChanged = true;
      }
    }

    if (recencyChanged) {
      this.derived.bump("recency");
    }
  }

  /**
   * Subscribe to store changes (any workspace).
   * Delegates to MapStore's subscribeAny.
   */
  subscribe = this.states.subscribeAny;

  /**
   * Subscribe to changes for a specific workspace.
   * Only notified when this workspace's state changes.
   */
  subscribeKey = (workspaceId: string, listener: () => void) => {
    return this.states.subscribeKey(workspaceId, listener);
  };

  /**
   * Get state for a specific workspace.
   * Lazy computation - only runs when version changes.
   */
  getWorkspaceState(workspaceId: string): WorkspaceState {
    return this.states.get(workspaceId, () => {
      const aggregator = this.getOrCreateAggregator(workspaceId);
      const hasMessages = aggregator.hasMessages();
      const isCaughtUp = this.caughtUp.get(workspaceId) ?? false;
      const activeStreams = aggregator.getActiveStreams();
      const messages = aggregator.getAllMessages();

      return {
        messages: aggregator.getDisplayedMessages(),
        canInterrupt: activeStreams.length > 0,
        isCompacting: aggregator.isCompacting(),
        loading: !hasMessages && !isCaughtUp,
        cmuxMessages: messages,
        currentModel: aggregator.getCurrentModel() ?? "claude-sonnet-4-5",
        recencyTimestamp: aggregator.getRecencyTimestamp(),
      };
    });
  }

  /**
   * Get sidebar state for a workspace (subset of full state).
   * This returns a stable reference that only changes when relevant fields change.
   * Used by sidebar components to avoid re-renders when messages update.
   */
  private sidebarStateCache = new Map<
    string,
    { state: WorkspaceSidebarState; sourceVersion: number }
  >();

  getWorkspaceSidebarState(workspaceId: string): WorkspaceSidebarState {
    const fullState = this.getWorkspaceState(workspaceId);
    const cached = this.sidebarStateCache.get(workspaceId);

    // Check if we have a cached sidebar state for this workspace
    if (cached) {
      // Check if relevant fields haven't changed
      if (
        cached.state.canInterrupt === fullState.canInterrupt &&
        cached.state.currentModel === fullState.currentModel &&
        cached.state.recencyTimestamp === fullState.recencyTimestamp
      ) {
        // Return cached sidebar state (stable reference)
        return cached.state;
      }
    }

    // Create new sidebar state
    const sidebarState: WorkspaceSidebarState = {
      canInterrupt: fullState.canInterrupt,
      currentModel: fullState.currentModel,
      recencyTimestamp: fullState.recencyTimestamp,
    };

    this.sidebarStateCache.set(workspaceId, { state: sidebarState, sourceVersion: 0 });
    return sidebarState;
  }

  /**
   * Get all workspace states as a Map.
   * Derived on-demand from individual workspace states.
   */
  getAllStates(): Map<string, WorkspaceState> {
    return this.derived.get("all-states", () => {
      const allStates = new Map<string, WorkspaceState>();
      for (const workspaceId of this.aggregators.keys()) {
        allStates.set(workspaceId, this.getWorkspaceState(workspaceId));
      }
      return allStates;
    }) as Map<string, WorkspaceState>;
  }

  /**
   * Get recency timestamps for all workspaces (for sorting in command palette).
   * Derived on-demand from individual workspace states.
   */
  getWorkspaceRecency(): Record<string, number> {
    return this.derived.get("recency", () => {
      const timestamps: Record<string, number> = {};
      for (const workspaceId of this.aggregators.keys()) {
        const state = this.getWorkspaceState(workspaceId);
        if (state.recencyTimestamp !== null) {
          timestamps[workspaceId] = state.recencyTimestamp;
        }
      }
      return timestamps;
    }) as Record<string, number>;
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
    this.states.delete(workspaceId);
    this.aggregators.delete(workspaceId);
    this.caughtUp.delete(workspaceId);
    this.historicalMessages.delete(workspaceId);
    this.recencyCache.delete(workspaceId);
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
    this.states.clear();
    this.derived.clear();
    this.aggregators.clear();
    this.caughtUp.clear();
    this.historicalMessages.clear();
  }

  // Private methods

  private getOrCreateAggregator(workspaceId: string): StreamingMessageAggregator {
    if (!this.aggregators.has(workspaceId)) {
      this.aggregators.set(workspaceId, new StreamingMessageAggregator());
    }
    return this.aggregators.get(workspaceId)!;
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
      this.states.bump(workspaceId);
      return;
    }

    if (isStreamError(data)) {
      aggregator.handleStreamError(data);
      this.states.bump(workspaceId);
      window.dispatchEvent(
        new CustomEvent(CUSTOM_EVENTS.RESUME_CHECK_REQUESTED, {
          detail: { workspaceId },
        })
      );
      return;
    }

    if (isDeleteMessage(data)) {
      aggregator.handleDeleteMessage(data);
      this.states.bump(workspaceId);
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
      this.states.bump(workspaceId);
      return;
    }

    if (isStreamDelta(data)) {
      aggregator.handleStreamDelta(data);
      this.states.bump(workspaceId);
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
                  this.states.bump(workspaceId);
                }
              })();
              return;
            }
            break;
          }
        }
      }

      this.states.bump(workspaceId);
      return;
    }

    if (isStreamAbort(data)) {
      aggregator.clearTokenState(data.messageId);
      aggregator.handleStreamAbort(data);
      this.states.bump(workspaceId);
      window.dispatchEvent(
        new CustomEvent(CUSTOM_EVENTS.RESUME_CHECK_REQUESTED, {
          detail: { workspaceId },
        })
      );
      return;
    }

    if (isToolCallStart(data)) {
      aggregator.handleToolCallStart(data);
      this.states.bump(workspaceId);
      return;
    }

    if (isToolCallDelta(data)) {
      aggregator.handleToolCallDelta(data);
      this.states.bump(workspaceId);
      return;
    }

    if (isToolCallEnd(data)) {
      aggregator.handleToolCallEnd(data);
      this.states.bump(workspaceId);
      return;
    }

    if (isReasoningDelta(data)) {
      aggregator.handleReasoningDelta(data);
      this.states.bump(workspaceId);
      return;
    }

    if (isReasoningEnd(data)) {
      aggregator.handleReasoningEnd(data);
      this.states.bump(workspaceId);
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
      this.states.bump(workspaceId);
    }
  }
}

// ============================================================================
// React Integration with useSyncExternalStore
// ============================================================================

// Singleton store instance
let storeInstance: WorkspaceStore | null = null;

/**
 * Get or create the singleton WorkspaceStore instance.
 */
function getStoreInstance(): WorkspaceStore {
  storeInstance ??= new WorkspaceStore(() => {
    // Model tracking callback - can hook into other systems if needed
  });
  return storeInstance;
}

/**
 * Hook to get state for a specific workspace.
 * Only re-renders when THIS workspace's state changes.
 *
 * Uses per-key subscription for surgical updates - only notified when
 * this specific workspace's state changes.
 */
export function useWorkspaceState(workspaceId: string): WorkspaceState {
  const store = getStoreInstance();

  return useSyncExternalStore(
    (listener) => store.subscribeKey(workspaceId, listener),
    () => store.getWorkspaceState(workspaceId)
  );
}

/**
 * Hook to access the raw store for imperative operations.
 */
export function useWorkspaceStoreRaw(): WorkspaceStore {
  return getStoreInstance();
}

/**
 * Hook to get workspace recency timestamps.
 */
export function useWorkspaceRecency(): Record<string, number> {
  const store = getStoreInstance();

  return useSyncExternalStore(store.subscribe, () => store.getWorkspaceRecency());
}

/**
 * Hook to get sidebar-specific state for a workspace.
 * Only re-renders when sidebar-relevant fields change (not on every message).
 *
 * Uses per-key subscription + derived selector.
 */
export function useWorkspaceSidebarState(workspaceId: string): WorkspaceSidebarState {
  const store = getStoreInstance();

  return useSyncExternalStore(
    (listener) => store.subscribeKey(workspaceId, listener),
    () => store.getWorkspaceSidebarState(workspaceId)
  );
}

/**
 * Hook to get an aggregator for a workspace.
 */
export function useWorkspaceAggregator(workspaceId: string) {
  const store = useWorkspaceStoreRaw();
  return store.getAggregator(workspaceId);
}
