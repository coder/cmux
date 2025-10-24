import assert from "@/utils/assert";
import type { CmuxMessage, DisplayedMessage } from "@/types/message";
import { createCmuxMessage } from "@/types/message";
import type { FrontendWorkspaceMetadata } from "@/types/workspace";
import type { WorkspaceChatMessage } from "@/types/ipc";
import type { TodoItem } from "@/types/tools";
import { StreamingMessageAggregator } from "@/utils/messages/StreamingMessageAggregator";
import { updatePersistedState } from "@/hooks/usePersistedState";
import { getRetryStateKey } from "@/constants/storage";
import { CUSTOM_EVENTS } from "@/constants/events";
import { useSyncExternalStore } from "react";
import { isCaughtUpMessage, isStreamError, isDeleteMessage, isCmuxMessage } from "@/types/ipc";
import { MapStore } from "./MapStore";
import { createDisplayUsage } from "@/utils/tokens/displayUsage";
import { WorkspaceConsumerManager } from "./WorkspaceConsumerManager";
import type { ChatUsageDisplay } from "@/utils/tokens/usageAggregator";
import type { TokenConsumer } from "@/types/chatStats";
import type { LanguageModelV2Usage } from "@ai-sdk/provider";
import { getCancelledCompactionKey } from "@/constants/storage";
import { isCompactingStream, findCompactionRequestMessage } from "@/utils/compaction/handler";

export interface WorkspaceState {
  messages: DisplayedMessage[];
  canInterrupt: boolean;
  isCompacting: boolean;
  loading: boolean;
  cmuxMessages: CmuxMessage[];
  currentModel: string | null;
  recencyTimestamp: number | null;
  todos: TodoItem[];
}

/**
 * Subset of WorkspaceState needed for sidebar display.
 * Subscribing to only these fields prevents re-renders when messages update.
 */
export interface WorkspaceSidebarState {
  canInterrupt: boolean;
  currentModel: string | null;
  recencyTimestamp: number | null;
}

/**
 * Helper to extract sidebar state from aggregator.
 */
function extractSidebarState(aggregator: StreamingMessageAggregator): WorkspaceSidebarState {
  return {
    canInterrupt: aggregator.getActiveStreams().length > 0,
    currentModel: aggregator.getCurrentModel() ?? null,
    recencyTimestamp: aggregator.getRecencyTimestamp(),
  };
}

/**
 * Derived state values stored in the derived MapStore.
 * Currently only recency timestamps for workspace sorting.
 */
type DerivedState = Record<string, number>;

/**
 * Usage metadata extracted from API responses (no tokenization).
 * Updates instantly when usage metadata arrives.
 */
export interface WorkspaceUsageState {
  usageHistory: ChatUsageDisplay[];
  totalTokens: number;
}

/**
 * Consumer breakdown requiring tokenization (lazy calculation).
 * Updates after async Web Worker calculation completes.
 */
export interface WorkspaceConsumersState {
  consumers: TokenConsumer[];
  tokenizerName: string;
  totalTokens: number; // Total from tokenization (may differ from usage totalTokens)
  isCalculating: boolean;
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
  // Per-workspace state (lazy computed on get)
  private states = new MapStore<string, WorkspaceState>();

  // Derived aggregate state (computed from multiple workspaces)
  private derived = new MapStore<string, DerivedState>();

  // Usage and consumer stores (two-store approach for CostsTab optimization)
  private usageStore = new MapStore<string, WorkspaceUsageState>();
  private consumersStore = new MapStore<string, WorkspaceConsumersState>();

  // Manager for consumer calculations (debouncing, caching, lazy loading)
  // Architecture: WorkspaceStore orchestrates (decides when), manager executes (performs calculations)
  // Dual-cache: consumersStore (MapStore) handles subscriptions, manager owns data cache
  private readonly consumerManager: WorkspaceConsumerManager;
  private readonly cleanupTokenizerReady: () => void;

  // Supporting data structures
  private aggregators = new Map<string, StreamingMessageAggregator>();
  private ipcUnsubscribers = new Map<string, () => void>();
  private caughtUp = new Map<string, boolean>();
  private historicalMessages = new Map<string, CmuxMessage[]>();
  private pendingStreamEvents = new Map<string, WorkspaceChatMessage[]>();

  /**
   * Map of event types to their handlers. This is the single source of truth for:
   * 1. Which events should be buffered during replay (the keys)
   * 2. How to process those events (the values)
   *
   * By keeping check and processing in one place, we make it structurally impossible
   * to buffer an event type without having a handler for it.
   */
  private readonly bufferedEventHandlers: Record<
    string,
    (
      workspaceId: string,
      aggregator: StreamingMessageAggregator,
      data: WorkspaceChatMessage
    ) => void
  > = {
    "stream-start": (workspaceId, aggregator, data) => {
      aggregator.handleStreamStart(data as never);
      if (this.onModelUsed) {
        this.onModelUsed((data as { model: string }).model);
      }
      updatePersistedState(getRetryStateKey(workspaceId), {
        attempt: 0,
        retryStartTime: Date.now(),
      });
      this.states.bump(workspaceId);
    },
    "stream-delta": (workspaceId, aggregator, data) => {
      aggregator.handleStreamDelta(data as never);
      this.states.bump(workspaceId);
    },
    "stream-end": (workspaceId, aggregator, data) => {
      aggregator.handleStreamEnd(data as never);
      aggregator.clearTokenState((data as { messageId: string }).messageId);

      if (this.handleCompactionCompletion(workspaceId, aggregator, data)) {
        return;
      }

      this.states.bump(workspaceId);
      this.checkAndBumpRecencyIfChanged();
      this.finalizeUsageStats(workspaceId, (data as { metadata?: never }).metadata);
    },
    "stream-abort": (workspaceId, aggregator, data) => {
      aggregator.clearTokenState((data as { messageId: string }).messageId);
      aggregator.handleStreamAbort(data as never);

      if (this.handleCompactionAbort(workspaceId, aggregator, data)) {
        return;
      }

      this.states.bump(workspaceId);
      this.dispatchResumeCheck(workspaceId);
      this.finalizeUsageStats(workspaceId, (data as { metadata?: never }).metadata);
    },
    "tool-call-start": (workspaceId, aggregator, data) => {
      aggregator.handleToolCallStart(data as never);
      this.states.bump(workspaceId);
    },
    "tool-call-delta": (workspaceId, aggregator, data) => {
      aggregator.handleToolCallDelta(data as never);
      this.states.bump(workspaceId);
    },
    "tool-call-end": (workspaceId, aggregator, data) => {
      aggregator.handleToolCallEnd(data as never);
      this.states.bump(workspaceId);
      this.consumerManager.scheduleCalculation(workspaceId, aggregator);
    },
    "reasoning-delta": (workspaceId, aggregator, data) => {
      aggregator.handleReasoningDelta(data as never);
      this.states.bump(workspaceId);
    },
    "reasoning-end": (workspaceId, aggregator, data) => {
      aggregator.handleReasoningEnd(data as never);
      this.states.bump(workspaceId);
    },
    "init-start": (workspaceId, aggregator, data) => {
      aggregator.handleMessage(data);
      this.states.bump(workspaceId);
    },
    "init-output": (workspaceId, aggregator, data) => {
      aggregator.handleMessage(data);
      this.states.bump(workspaceId);
    },
    "init-end": (workspaceId, aggregator, data) => {
      aggregator.handleMessage(data);
      this.states.bump(workspaceId);
    },
  };

  // Cache of last known recency per workspace (for change detection)
  private recencyCache = new Map<string, number | null>();

  // Store workspace metadata for aggregator creation (ensures createdAt never lost)
  private workspaceCreatedAt = new Map<string, string>();

  // Track previous sidebar state per workspace (to prevent unnecessary bumps)
  private previousSidebarValues = new Map<string, WorkspaceSidebarState>();

  // Track workspaces currently replaying buffered history (to avoid O(N) scheduling)
  private replayingHistory = new Set<string>();

  // Track model usage (injected dependency for useModelLRU integration)
  private readonly onModelUsed?: (model: string) => void;

  constructor(onModelUsed?: (model: string) => void) {
    this.onModelUsed = onModelUsed;

    // Initialize consumer calculation manager
    this.consumerManager = new WorkspaceConsumerManager((workspaceId) => {
      this.consumersStore.bump(workspaceId);
    });

    const rescheduleConsumers = () => {
      for (const [workspaceId, aggregator] of this.aggregators.entries()) {
        assert(
          workspaceId.length > 0,
          "Workspace ID must be non-empty when rescheduling consumers"
        );
        if (!this.caughtUp.get(workspaceId)) {
          continue;
        }
        if (aggregator.getAllMessages().length === 0) {
          continue;
        }
        this.consumerManager.scheduleCalculation(workspaceId, aggregator);
      }
    };

    const cleanupReady = this.consumerManager.onTokenizerReady(rescheduleConsumers);
    const cleanupEncoding = this.consumerManager.onTokenizerEncodingLoaded(() => {
      rescheduleConsumers();
    });
    this.cleanupTokenizerReady = () => {
      cleanupReady();
      cleanupEncoding();
    };

    // Note: We DON'T auto-check recency on every state bump.
    // Instead, checkAndBumpRecencyIfChanged() is called explicitly after
    // message completion events (not on deltas) to prevent App.tsx re-renders.
  }

  /**
   * Dispatch resume check event for a workspace.
   * Triggers useResumeManager to check if interrupted stream can be resumed.
   */
  private dispatchResumeCheck(workspaceId: string): void {
    window.dispatchEvent(
      new CustomEvent(CUSTOM_EVENTS.RESUME_CHECK_REQUESTED, {
        detail: { workspaceId },
      })
    );
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
   * Only bump workspace state if sidebar-relevant fields changed.
   * Prevents unnecessary re-renders during stream deltas.
   */
  private bumpIfSidebarChanged(workspaceId: string): void {
    const aggregator = this.aggregators.get(workspaceId);
    if (!aggregator) return;

    const current = extractSidebarState(aggregator);
    const previous = this.previousSidebarValues.get(workspaceId);

    // First time or any relevant field changed
    if (
      !previous ||
      previous.canInterrupt !== current.canInterrupt ||
      previous.currentModel !== current.currentModel ||
      previous.recencyTimestamp !== current.recencyTimestamp
    ) {
      this.previousSidebarValues.set(workspaceId, current);
      this.states.bump(workspaceId);
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
        currentModel: aggregator.getCurrentModel() ?? null,
        recencyTimestamp: aggregator.getRecencyTimestamp(),
        todos: aggregator.getCurrentTodos(),
      };
    });
  }

  // Cache sidebar state objects to return stable references
  private sidebarStateCache = new Map<string, WorkspaceSidebarState>();

  /**
   * Get sidebar state for a workspace (subset of full state).
   * Returns cached reference if values haven't changed.
   * This is critical for useSyncExternalStore - must return stable references.
   */
  getWorkspaceSidebarState(workspaceId: string): WorkspaceSidebarState {
    const fullState = this.getWorkspaceState(workspaceId);
    const cached = this.sidebarStateCache.get(workspaceId);

    // Return cached if values match
    if (
      cached &&
      cached.canInterrupt === fullState.canInterrupt &&
      cached.currentModel === fullState.currentModel &&
      cached.recencyTimestamp === fullState.recencyTimestamp
    ) {
      return cached;
    }

    // Create and cache new state
    const newState: WorkspaceSidebarState = {
      canInterrupt: fullState.canInterrupt,
      currentModel: fullState.currentModel,
      recencyTimestamp: fullState.recencyTimestamp,
    };
    this.sidebarStateCache.set(workspaceId, newState);
    return newState;
  }

  /**
   * Get all workspace states as a Map.
   * Returns a new Map on each call - not cached/reactive.
   * Used by imperative code, not for React subscriptions.
   */
  getAllStates(): Map<string, WorkspaceState> {
    const allStates = new Map<string, WorkspaceState>();
    for (const workspaceId of this.aggregators.keys()) {
      allStates.set(workspaceId, this.getWorkspaceState(workspaceId));
    }
    return allStates;
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
   * Get current TODO list for a workspace.
   * Returns empty array if workspace doesn't exist or has no TODOs.
   */
  getTodos(workspaceId: string): TodoItem[] {
    const aggregator = this.aggregators.get(workspaceId);
    return aggregator ? aggregator.getCurrentTodos() : [];
  }

  /**
   * Extract usage from messages (no tokenization).
   * Each usage entry calculated with its own model for accurate costs.
   */
  getWorkspaceUsage(workspaceId: string): WorkspaceUsageState {
    return this.usageStore.get(workspaceId, () => {
      const aggregator = this.getOrCreateAggregator(workspaceId);
      const messages = aggregator.getAllMessages();

      // Extract usage from assistant messages
      const usageHistory: ChatUsageDisplay[] = [];

      for (const msg of messages) {
        if (msg.role === "assistant" && msg.metadata?.usage) {
          // Use the model from this specific message (not global)
          const model = msg.metadata.model ?? aggregator.getCurrentModel() ?? "unknown";

          const usage = createDisplayUsage(
            msg.metadata.usage,
            model,
            msg.metadata.providerMetadata
          );

          if (usage) {
            usageHistory.push(usage);
          }
        }
      }

      // Calculate total from usage history
      const totalTokens = usageHistory.reduce(
        (sum, u) =>
          sum +
          u.input.tokens +
          u.cached.tokens +
          u.cacheCreate.tokens +
          u.output.tokens +
          u.reasoning.tokens,
        0
      );

      return { usageHistory, totalTokens };
    });
  }

  /**
   * Get consumer breakdown (may be calculating).
   * Triggers lazy calculation if workspace is caught-up but no data exists.
   *
   * Architecture: Lazy trigger runs on EVERY access (outside MapStore.get())
   * so workspace switches trigger calculation even if MapStore has cached result.
   */
  getWorkspaceConsumers(workspaceId: string): WorkspaceConsumersState {
    const aggregator = this.aggregators.get(workspaceId);
    const isCaughtUp = this.caughtUp.get(workspaceId) ?? false;

    // Lazy trigger check (runs on EVERY access, not just when MapStore recomputes)
    const cached = this.consumerManager.getCachedState(workspaceId);
    const isPending = this.consumerManager.isPending(workspaceId);

    if (!cached && !isPending && isCaughtUp) {
      if (aggregator && aggregator.getAllMessages().length > 0) {
        // Defer scheduling to avoid setState-during-render warning
        // queueMicrotask ensures this runs after current render completes
        queueMicrotask(() => {
          this.consumerManager.scheduleCalculation(workspaceId, aggregator);
        });
      }
    }

    // Return state (MapStore handles subscriptions, delegates to manager for actual state)
    return this.consumersStore.get(workspaceId, () => {
      return this.consumerManager.getStateSync(workspaceId);
    });
  }

  /**
   * Subscribe to usage store changes for a specific workspace.
   */
  subscribeUsage(workspaceId: string, listener: () => void): () => void {
    return this.usageStore.subscribeKey(workspaceId, listener);
  }

  /**
   * Subscribe to consumer store changes for a specific workspace.
   */
  subscribeConsumers(workspaceId: string, listener: () => void): () => void {
    return this.consumersStore.subscribeKey(workspaceId, listener);
  }

  /**
   * Handle compact_summary tool completion.
   * Returns true if compaction was handled (caller should early return).
   */
  // Track processed compaction-request IDs to dedupe performCompaction across duplicated events
  private processedCompactionRequestIds = new Set<string>();

  private handleCompactionCompletion(
    workspaceId: string,
    aggregator: StreamingMessageAggregator,
    data: WorkspaceChatMessage
  ): boolean {
    // Type guard: only StreamEndEvent has messageId
    if (!("messageId" in data)) return false;

    // Check if this was a compaction stream
    if (!isCompactingStream(aggregator)) {
      return false;
    }

    // Extract the compaction-request message to identify this compaction run
    const compactionRequestMsg = findCompactionRequestMessage(aggregator);
    if (!compactionRequestMsg) {
      return false;
    }

    // Dedupe: If we've already processed this compaction-request, skip re-running
    if (this.processedCompactionRequestIds.has(compactionRequestMsg.id)) {
      return true; // Already handled compaction for this request
    }

    // Extract the summary text from the assistant's response
    const summary = aggregator.getCompactionSummary(data.messageId);
    if (!summary) {
      console.warn("[WorkspaceStore] Compaction completed but no summary text found");
      return false;
    }

    // Mark this compaction-request as processed before performing compaction
    this.processedCompactionRequestIds.add(compactionRequestMsg.id);

    this.performCompaction(workspaceId, aggregator, data, summary);
    return true;
  }

  /**
   * Handle interruption of a compaction stream (StreamAbortEvent).
   *
   * Two distinct flows trigger this:
   * - **Ctrl+A (accept early)**: Perform compaction with [truncated] sentinel
   * - **Ctrl+C (cancel)**: Skip compaction, let cancelCompaction handle cleanup
   *
   * Uses localStorage to distinguish flows:
   * - Checks for cancellation marker in localStorage
   * - Verifies messageId matches for freshness
   * - Reload-safe: localStorage persists across page reloads
   */
  private handleCompactionAbort(
    workspaceId: string,
    aggregator: StreamingMessageAggregator,
    data: WorkspaceChatMessage
  ): boolean {
    // Type guard: only StreamAbortEvent has messageId
    if (!("messageId" in data)) return false;

    // Check if this was a compaction stream
    if (!isCompactingStream(aggregator)) {
      return false;
    }

    // Get the compaction request message for ID verification
    const compactionRequestMsg = findCompactionRequestMessage(aggregator);
    if (!compactionRequestMsg) {
      return false;
    }

    // Ctrl+C flow: Check localStorage for cancellation marker
    // Verify compaction-request user message ID matches (stable across retries)
    const storageKey = getCancelledCompactionKey(workspaceId);
    const cancelData = localStorage.getItem(storageKey);
    if (cancelData) {
      try {
        const parsed = JSON.parse(cancelData) as { compactionRequestId: string; timestamp: number };
        if (parsed.compactionRequestId === compactionRequestMsg.id) {
          // This is a cancelled compaction - clean up marker and skip compaction
          localStorage.removeItem(storageKey);
          return false; // Skip compaction, cancelCompaction() handles cleanup
        }
      } catch (error) {
        console.error("[WorkspaceStore] Failed to parse cancellation data:", error);
      }
      // If compactionRequestId doesn't match or parse failed, clean up stale data
      localStorage.removeItem(storageKey);
    }

    // Ctrl+A flow: Accept early with [truncated] sentinel
    const partialSummary = aggregator.getCompactionSummary(data.messageId);
    if (!partialSummary) {
      console.warn("[WorkspaceStore] Compaction aborted but no partial summary found");
      return false;
    }

    // Append [truncated] sentinel on new line to indicate incomplete summary
    const truncatedSummary = partialSummary.trim() + "\n\n[truncated]";

    this.performCompaction(workspaceId, aggregator, data, truncatedSummary);
    return true;
  }

  /**
   * Perform history compaction by replacing chat history with summary message.
   * Type-safe: only called when we've verified data is a StreamEndEvent.
   */
  private performCompaction(
    workspaceId: string,
    aggregator: StreamingMessageAggregator,
    data: WorkspaceChatMessage,
    summary: string
  ): void {
    // Extract metadata safely with type guard
    const metadata = "metadata" in data ? data.metadata : undefined;

    // Extract continueMessage from compaction-request before history gets replaced
    const compactRequestMsg = findCompactionRequestMessage(aggregator);
    const cmuxMeta = compactRequestMsg?.metadata?.cmuxMetadata;
    const continueMessage =
      cmuxMeta?.type === "compaction-request" ? cmuxMeta.parsed.continueMessage : undefined;

    const summaryMessage = createCmuxMessage(
      `summary-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      "assistant",
      summary,
      {
        timestamp: Date.now(),
        compacted: true,
        model: aggregator.getCurrentModel(),
        usage: metadata?.usage,
        providerMetadata:
          metadata && "providerMetadata" in metadata
            ? (metadata.providerMetadata as Record<string, unknown> | undefined)
            : undefined,
        duration: metadata?.duration,
        systemMessageTokens:
          metadata && "systemMessageTokens" in metadata
            ? (metadata.systemMessageTokens as number | undefined)
            : undefined,
        // Store continueMessage in summary so it survives history replacement
        cmuxMetadata: continueMessage
          ? { type: "compaction-result", continueMessage, requestId: compactRequestMsg?.id }
          : { type: "normal" },
      }
    );

    void (async () => {
      try {
        await window.api.workspace.replaceChatHistory(workspaceId, summaryMessage);
      } catch (error) {
        console.error("[WorkspaceStore] Failed to replace history:", error);
      } finally {
        this.states.bump(workspaceId);
        this.checkAndBumpRecencyIfChanged();
      }
    })();
  }

  /**
   * Update usage and schedule consumer calculation after stream completion.
   *
   * CRITICAL ORDERING: This must be called AFTER the aggregator updates its messages.
   * If called before, the UI will re-render and read stale data from the aggregator,
   * causing a race condition where usage appears empty until refresh.
   *
   * Handles both:
   * - Instant usage display (from API metadata) - only if usage present
   * - Async consumer breakdown (tokenization via Web Worker) - normally scheduled,
   *   but skipped during history replay to avoid O(N) scheduling overhead
   */
  private finalizeUsageStats(
    workspaceId: string,
    metadata?: { usage?: LanguageModelV2Usage }
  ): void {
    // During history replay: only bump usage, skip scheduling (caught-up schedules once at end)
    if (this.replayingHistory.has(workspaceId)) {
      if (metadata?.usage) {
        this.usageStore.bump(workspaceId);
      }
      return;
    }

    // Normal real-time path: bump usage and schedule calculation
    if (metadata?.usage) {
      this.usageStore.bump(workspaceId);
    }

    // Always schedule consumer calculation (tool calls, text, etc. need tokenization)
    // Even streams without usage metadata need token counts recalculated
    const aggregator = this.aggregators.get(workspaceId);
    if (aggregator) {
      this.consumerManager.scheduleCalculation(workspaceId, aggregator);
    }
  }

  /**
   * Add a workspace and subscribe to its IPC events.
   */
  addWorkspace(metadata: FrontendWorkspaceMetadata): void {
    const workspaceId = metadata.id;

    // Skip if already subscribed
    if (this.ipcUnsubscribers.has(workspaceId)) {
      return;
    }

    const aggregator = this.getOrCreateAggregator(workspaceId, metadata.createdAt);

    // Initialize recency cache and bump derived store immediately
    // This ensures UI sees correct workspace order before messages load
    const initialRecency = aggregator.getRecencyTimestamp();
    if (initialRecency !== null) {
      this.recencyCache.set(workspaceId, initialRecency);
      this.derived.bump("recency");
    }

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
    // Clean up consumer manager state
    this.consumerManager.removeWorkspace(workspaceId);

    // Unsubscribe from IPC
    const unsubscribe = this.ipcUnsubscribers.get(workspaceId);
    if (unsubscribe) {
      unsubscribe();
      this.ipcUnsubscribers.delete(workspaceId);
    }

    // Clean up state
    this.states.delete(workspaceId);
    this.usageStore.delete(workspaceId);
    this.consumersStore.delete(workspaceId);
    this.aggregators.delete(workspaceId);
    this.caughtUp.delete(workspaceId);
    this.historicalMessages.delete(workspaceId);
    this.pendingStreamEvents.delete(workspaceId);
    this.recencyCache.delete(workspaceId);
    this.previousSidebarValues.delete(workspaceId);
    this.sidebarStateCache.delete(workspaceId);
    this.workspaceCreatedAt.delete(workspaceId);
  }

  /**
   * Sync workspaces with metadata - add new, remove deleted.
   */
  syncWorkspaces(workspaceMetadata: Map<string, FrontendWorkspaceMetadata>): void {
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
    // Clean up consumer manager
    this.consumerManager.dispose();
    this.cleanupTokenizerReady();

    for (const unsubscribe of this.ipcUnsubscribers.values()) {
      unsubscribe();
    }
    this.ipcUnsubscribers.clear();
    this.states.clear();
    this.derived.clear();
    this.usageStore.clear();
    this.consumersStore.clear();
    this.aggregators.clear();
    this.caughtUp.clear();
    this.historicalMessages.clear();
    this.pendingStreamEvents.clear();
    this.workspaceCreatedAt.clear();
  }

  // Private methods

  private getOrCreateAggregator(
    workspaceId: string,
    createdAt?: string
  ): StreamingMessageAggregator {
    // Store createdAt if provided (ensures it's never lost)
    if (createdAt) {
      this.workspaceCreatedAt.set(workspaceId, createdAt);
    }

    if (!this.aggregators.has(workspaceId)) {
      // Use stored createdAt if available, otherwise use provided value
      const storedCreatedAt = this.workspaceCreatedAt.get(workspaceId);
      this.aggregators.set(
        workspaceId,
        new StreamingMessageAggregator(storedCreatedAt ?? createdAt)
      );
    }
    return this.aggregators.get(workspaceId)!;
  }

  /**
   * Check if data is a buffered event type by checking the handler map.
   * This ensures isStreamEvent() and processStreamEvent() can never fall out of sync.
   */
  private isBufferedEvent(data: WorkspaceChatMessage): boolean {
    return "type" in data && data.type in this.bufferedEventHandlers;
  }

  private handleChatMessage(workspaceId: string, data: WorkspaceChatMessage): void {
    const aggregator = this.getOrCreateAggregator(workspaceId);
    const isCaughtUp = this.caughtUp.get(workspaceId) ?? false;
    const historicalMsgs = this.historicalMessages.get(workspaceId) ?? [];

    if (isCaughtUpMessage(data)) {
      // Load historical messages first
      if (historicalMsgs.length > 0) {
        aggregator.loadHistoricalMessages(historicalMsgs);
        this.historicalMessages.set(workspaceId, []);
      }

      // Mark that we're replaying buffered history (prevents O(N) scheduling)
      this.replayingHistory.add(workspaceId);

      // Process buffered stream events now that history is loaded
      const pendingEvents = this.pendingStreamEvents.get(workspaceId) ?? [];
      for (const event of pendingEvents) {
        this.processStreamEvent(workspaceId, aggregator, event);
      }
      this.pendingStreamEvents.set(workspaceId, []);

      // Done replaying buffered events
      this.replayingHistory.delete(workspaceId);

      // Mark as caught up
      this.caughtUp.set(workspaceId, true);
      this.states.bump(workspaceId);
      this.checkAndBumpRecencyIfChanged(); // Messages loaded, update recency

      // Bump usage after loading history
      this.usageStore.bump(workspaceId);

      // Schedule consumer calculation once after all buffered events processed
      if (aggregator.getAllMessages().length > 0) {
        this.consumerManager.scheduleCalculation(workspaceId, aggregator);
      }

      return;
    }

    // OPTIMIZATION: Buffer stream events until caught-up to reduce excess re-renders
    // When first subscribing to a workspace, we receive:
    // 1. Historical messages from chat.jsonl (potentially hundreds of messages)
    // 2. Partial stream state (if stream was interrupted)
    // 3. Active stream events (if currently streaming)
    //
    // Without buffering, each event would trigger a separate re-render as messages
    // arrive one-by-one over IPC. By buffering until "caught-up", we:
    // - Load all historical messages in one batch (O(1) render instead of O(N))
    // - Replay buffered stream events after history is loaded
    // - Provide correct context for stream continuation (history is complete)
    //
    // This is especially important for workspaces with long histories (100+ messages),
    // where unbuffered rendering would cause visible lag and UI stutter.
    if (!isCaughtUp && this.isBufferedEvent(data)) {
      const pending = this.pendingStreamEvents.get(workspaceId) ?? [];
      pending.push(data);
      this.pendingStreamEvents.set(workspaceId, pending);
      return;
    }

    // Process event immediately (already caught up or not a stream event)
    this.processStreamEvent(workspaceId, aggregator, data);
  }

  private processStreamEvent(
    workspaceId: string,
    aggregator: StreamingMessageAggregator,
    data: WorkspaceChatMessage
  ): void {
    // Handle non-buffered special events first
    if (isStreamError(data)) {
      aggregator.handleStreamError(data);
      this.states.bump(workspaceId);
      this.dispatchResumeCheck(workspaceId);
      return;
    }

    if (isDeleteMessage(data)) {
      aggregator.handleDeleteMessage(data);
      this.states.bump(workspaceId);
      this.checkAndBumpRecencyIfChanged();
      return;
    }

    // Try buffered event handlers (single source of truth)
    if ("type" in data && data.type in this.bufferedEventHandlers) {
      this.bufferedEventHandlers[data.type](workspaceId, aggregator, data);
      return;
    }

    // Regular messages (CmuxMessage without type field)
    if (isCmuxMessage(data)) {
      const isCaughtUp = this.caughtUp.get(workspaceId) ?? false;
      if (!isCaughtUp) {
        // Buffer historical CmuxMessages
        const historicalMsgs = this.historicalMessages.get(workspaceId) ?? [];
        historicalMsgs.push(data);
        this.historicalMessages.set(workspaceId, historicalMsgs);
      } else {
        // Process live events immediately (after history loaded)
        aggregator.handleMessage(data);
        this.states.bump(workspaceId);
        this.checkAndBumpRecencyIfChanged();
      }
      return;
    }

    // If we reach here, unknown message type - log for debugging
    if ("role" in data || "type" in data) {
      console.error("[WorkspaceStore] Unknown message type - not processed", {
        workspaceId,
        hasRole: "role" in data,
        hasType: "type" in data,
        type: "type" in data ? (data as { type: string }).type : undefined,
        role: "role" in data ? (data as { role: string }).role : undefined,
      });
    }
    // Note: Messages without role/type are silently ignored (expected for some IPC events)
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
 * getWorkspaceSidebarState returns cached references, so this won't cause
 * unnecessary re-renders even when the subscription fires.
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

/**
 * Hook for usage metadata (instant, no tokenization).
 * Updates immediately when usage metadata arrives from API responses.
 */
export function useWorkspaceUsage(workspaceId: string): WorkspaceUsageState {
  const store = getStoreInstance();
  return useSyncExternalStore(
    (listener) => store.subscribeUsage(workspaceId, listener),
    () => store.getWorkspaceUsage(workspaceId)
  );
}

/**
 * Hook for consumer breakdown (lazy, with tokenization).
 * Updates after async Web Worker calculation completes.
 */
export function useWorkspaceConsumers(workspaceId: string): WorkspaceConsumersState {
  const store = getStoreInstance();
  return useSyncExternalStore(
    (listener) => store.subscribeConsumers(workspaceId, listener),
    () => store.getWorkspaceConsumers(workspaceId)
  );
}
