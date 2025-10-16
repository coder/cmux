import type { CmuxMessage } from "@/types/message";
import type { WorkspaceConsumersState } from "./WorkspaceStore";
import { TokenStatsWorker } from "@/utils/tokens/TokenStatsWorker";
import type { StreamingMessageAggregator } from "@/utils/messages/StreamingMessageAggregator";

/**
 * Manages consumer token calculations for workspaces.
 * 
 * Responsibilities:
 * - Debounces rapid calculation requests (e.g., multiple tool-call-end events)
 * - Caches calculated results to avoid redundant work
 * - Tracks calculation state per workspace
 * - Provides lazy calculation trigger for workspace switching
 * 
 * This class is extracted from WorkspaceStore to keep concerns separated
 * and make the calculation logic easier to test and maintain.
 */
export class WorkspaceConsumerManager {
  // Web Worker for tokenization (shared across workspaces)
  private tokenWorker: TokenStatsWorker;

  // Track pending consumer calculations to avoid duplicates
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
   * Get consumer state for a workspace.
   * Triggers lazy calculation if workspace has messages but no cached data.
   */
  getState(
    workspaceId: string,
    aggregator: StreamingMessageAggregator | undefined,
    isCaughtUp: boolean
  ): WorkspaceConsumersState {
    // Check if we need to trigger calculation BEFORE returning cached state
    const cached = this.cache.get(workspaceId);
    const isCalculating = this.pendingCalcs.has(workspaceId);

    if (!cached && !isCalculating && isCaughtUp) {
      if (aggregator && aggregator.getAllMessages().length > 0) {
        // Trigger calculation (will debounce if called rapidly)
        this.scheduleCalculation(workspaceId, aggregator);
      }
    }

    // Return cached result if available
    if (cached) {
      return cached;
    }

    // Default state while calculating or before first calculation
    return {
      consumers: [],
      tokenizerName: "",
      totalTokens: 0,
      isCalculating,
    };
  }

  /**
   * Schedule a consumer calculation (debounced).
   * Batches rapid events (e.g., multiple tool-call-end) into single calculation.
   */
  scheduleCalculation(workspaceId: string, aggregator: StreamingMessageAggregator): void {
    // Clear existing timer for this workspace
    const existingTimer = this.debounceTimers.get(workspaceId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Skip if already calculating (prevents duplicates during debounce window)
    if (this.pendingCalcs.has(workspaceId)) {
      return;
    }

    // Set new timer (150ms - imperceptible to humans, batches rapid events)
    const timer = setTimeout(() => {
      this.debounceTimers.delete(workspaceId);
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
        console.error(`[WorkspaceConsumerManager] Calculation failed for ${workspaceId}:`, error);
        // Still cache empty state to clear "calculating" status
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
    this.pendingCalcs.clear();
  }
}

