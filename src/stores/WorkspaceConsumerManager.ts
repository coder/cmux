import type { CmuxMessage } from "@/types/message";
import type { WorkspaceConsumersState } from "./WorkspaceStore";
import { TokenStatsWorker } from "@/utils/tokens/TokenStatsWorker";
import type { StreamingMessageAggregator } from "@/utils/messages/StreamingMessageAggregator";

/**
 * Manages consumer token calculations for workspaces.
 * 
 * Responsibilities:
 * - Debounces rapid calculation requests (e.g., multiple tool-call-end events)
 * - Caches calculated results to avoid redundant work (source of truth)
 * - Tracks calculation state per workspace
 * - Executes Web Worker tokenization calculations
 * - Handles cleanup and disposal
 * 
 * Architecture:
 * - Single responsibility: consumer tokenization calculations
 * - Owns the source-of-truth cache (calculated consumer data)
 * - WorkspaceStore orchestrates (decides when to calculate)
 * - This manager executes (performs calculations, manages cache)
 * 
 * Dual-Cache Design:
 * - WorkspaceConsumerManager.cache: Source of truth for calculated data
 * - WorkspaceStore.consumersStore (MapStore): Subscription management only
 *   (components subscribe to workspace changes, delegates to manager for state)
 */
export class WorkspaceConsumerManager {
  // Web Worker for tokenization (shared across workspaces)
  private tokenWorker: TokenStatsWorker;

  // Track scheduled calculations (in debounce window, not yet executing)
  private scheduledCalcs = new Set<string>();

  // Track executing calculations (Web Worker running)
  private pendingCalcs = new Set<string>();

  // Cache calculated consumer data (persists across bumps)
  private cache = new Map<string, WorkspaceConsumersState>();

  // Debounce timers for consumer calculations (prevents rapid-fire during tool sequences)
  private debounceTimers = new Map<string, NodeJS.Timeout>();

  // Callback to bump the store when calculation completes
  private onCalculationComplete: (workspaceId: string) => void;

  constructor(onCalculationComplete: (workspaceId: string) => void) {
    this.tokenWorker = new TokenStatsWorker();
    this.onCalculationComplete = onCalculationComplete;
  }

  /**
   * Get cached state without side effects.
   * Returns null if no cache exists.
   */
  getCachedState(workspaceId: string): WorkspaceConsumersState | null {
    return this.cache.get(workspaceId) ?? null;
  }

  /**
   * Check if calculation is pending or scheduled for workspace.
   */
  isPending(workspaceId: string): boolean {
    return this.scheduledCalcs.has(workspaceId) || this.pendingCalcs.has(workspaceId);
  }

  /**
   * Get current state synchronously without triggering calculations.
   * Returns cached result if available, otherwise returns default state.
   * 
   * Note: This is called from WorkspaceStore.getWorkspaceConsumers(),
   * which handles the lazy trigger logic separately.
   */
  getStateSync(workspaceId: string): WorkspaceConsumersState {
    const cached = this.cache.get(workspaceId);
    if (cached) {
      return cached;
    }

    // Default state while scheduled/calculating or before first calculation
    return {
      consumers: [],
      tokenizerName: "",
      totalTokens: 0,
      isCalculating: this.scheduledCalcs.has(workspaceId) || this.pendingCalcs.has(workspaceId),
    };
  }

  /**
   * Schedule a consumer calculation (debounced).
   * Batches rapid events (e.g., multiple tool-call-end) into single calculation.
   * Marks as "calculating" immediately to prevent UI flash.
   */
  scheduleCalculation(workspaceId: string, aggregator: StreamingMessageAggregator): void {
    // Clear existing timer for this workspace
    const existingTimer = this.debounceTimers.get(workspaceId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Skip if already executing
    if (this.pendingCalcs.has(workspaceId)) {
      return;
    }

    // Mark as scheduled immediately (triggers "Calculating..." UI, prevents flash)
    const isNewSchedule = !this.scheduledCalcs.has(workspaceId);
    this.scheduledCalcs.add(workspaceId);

    // Notify store if newly scheduled (triggers UI update)
    if (isNewSchedule) {
      this.onCalculationComplete(workspaceId);
    }

    // Set new timer (150ms - imperceptible to humans, batches rapid events)
    const timer = setTimeout(() => {
      this.debounceTimers.delete(workspaceId);
      this.scheduledCalcs.delete(workspaceId); // Move from scheduled to pending
      this.executeCalculation(workspaceId, aggregator);
    }, 150);

    this.debounceTimers.set(workspaceId, timer);
  }

  /**
   * Execute background consumer calculation.
   * Only one calculation per workspace at a time.
   */
  private executeCalculation(workspaceId: string, aggregator: StreamingMessageAggregator): void {
    // Skip if already calculating
    if (this.pendingCalcs.has(workspaceId)) {
      return;
    }

    this.pendingCalcs.add(workspaceId);

    // Mark as calculating and notify store
    this.onCalculationComplete(workspaceId);

    // Run in next tick to avoid blocking caller
    queueMicrotask(async () => {
      try {
        const messages = aggregator.getAllMessages();
        const model = aggregator.getCurrentModel() ?? "unknown";

        // Calculate in Web Worker (off main thread)
        const fullStats = await this.tokenWorker.calculate(messages, model);

        // Store result in cache
        this.cache.set(workspaceId, {
          consumers: fullStats.consumers,
          tokenizerName: fullStats.tokenizerName,
          totalTokens: fullStats.totalTokens,
          isCalculating: false,
        });

        // Notify store to trigger re-render
        this.onCalculationComplete(workspaceId);
      } catch (error) {
        // Cancellations are expected during rapid events - don't cache, don't log
        // This allows lazy trigger to retry on next access
        if (error instanceof Error && error.message === "Cancelled by newer request") {
          return;
        }

        // Real errors: log and cache empty result
        console.error(`[WorkspaceConsumerManager] Calculation failed for ${workspaceId}:`, error);
        this.cache.set(workspaceId, {
          consumers: [],
          tokenizerName: "",
          totalTokens: 0,
          isCalculating: false,
        });
        this.onCalculationComplete(workspaceId);
      } finally {
        this.pendingCalcs.delete(workspaceId);
      }
    });
  }

  /**
   * Remove workspace state and cleanup timers.
   */
  removeWorkspace(workspaceId: string): void {
    // Clear debounce timer
    const timer = this.debounceTimers.get(workspaceId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(workspaceId);
    }

    // Clean up state
    this.cache.delete(workspaceId);
    this.scheduledCalcs.delete(workspaceId);
    this.pendingCalcs.delete(workspaceId);
  }

  /**
   * Cleanup all resources.
   */
  dispose(): void {
    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    // Terminate worker
    this.tokenWorker.terminate();

    // Clear state
    this.cache.clear();
    this.scheduledCalcs.clear();
    this.pendingCalcs.clear();
  }
}

