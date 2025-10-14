import { useEffect, useRef } from "react";
import { useWorkspaceStoreRaw, type WorkspaceState } from "@/stores/WorkspaceStore";
import { CUSTOM_EVENTS } from "@/constants/events";
import { getAutoRetryKey, getRetryStateKey } from "@/constants/storage";
import { getSendOptionsFromStorage } from "@/utils/messages/sendOptions";
import { readPersistedState } from "./usePersistedState";
import { hasInterruptedStream } from "@/utils/messages/retryEligibility";

interface RetryState {
  attempt: number;
  retryStartTime: number;
}

const INITIAL_DELAY = 1000; // 1 second
const MAX_DELAY = 60000; // 60 seconds

/**
 * Centralized auto-resume manager for interrupted streams
 *
 * DESIGN PRINCIPLE: Single Source of Truth for ALL Retry Logic
 * ============================================================
 * This hook is the ONLY place that calls window.api.workspace.resumeStream().
 * All other components (RetryBarrier, etc.) emit RESUME_CHECK_REQUESTED events
 * and let this hook handle the actual retry logic.
 *
 * Why this matters:
 * - Consistency: All retries use the same backoff, state management, eligibility checks
 * - Maintainability: One place to update retry logic
 * - Background operation: Works for all workspaces, even non-visible ones
 * - Idempotency: Safe to emit events multiple times, hook silently ignores invalid requests
 *
 * autoRetry State Semantics (Explicit Transitions Only):
 * -------------------------------------------------------
 * - true (default): System errors should auto-retry with exponential backoff
 * - false: User pressed Ctrl+C - don't auto-retry until user re-engages
 *
 * State transitions:
 * - User presses Ctrl+C → autoRetry = false
 * - User sends a message → autoRetry = true (clear intent: "I'm using this")
 * - User clicks manual retry → autoRetry = true
 * - NO automatic resets on stream events (prevents initialization bugs)
 *
 * Features:
 * - Polling-based: Checks all workspaces every 1 second
 * - Event-driven: Also reacts to RESUME_CHECK_REQUESTED events for fast path
 * - Idempotent: Safe to call multiple times, silently ignores invalid requests
 * - Background operation: Works for all workspaces, visible or not
 * - Exponential backoff: 1s → 2s → 4s → 8s → ... → 60s (max)
 *
 * Checks happen on:
 * - App startup (initial scan)
 * - Every 1 second (polling)
 * - Stream errors/aborts (events for fast response)
 * - Manual retry button (event from RetryBarrier)
 */
export function useResumeManager() {
  // Get workspace states from store
  // NOTE: We use a ref-based approach instead of useSyncExternalStore to avoid
  // re-rendering AppInner on every workspace state change. This hook only needs
  // to check eligibility periodically (polling) and on events.
  const store = useWorkspaceStoreRaw();
  const workspaceStatesRef = useRef<Map<string, WorkspaceState>>(new Map());

  // Update ref whenever store changes (but don't trigger re-render)
  const updateStatesRef = () => {
    workspaceStatesRef.current = store.getAllStates();
  };
  
  useEffect(() => {
    // Initial load
    updateStatesRef();
    
    // Subscribe to keep ref fresh, but don't cause re-renders
    const unsubscribe = store.subscribe(() => {
      updateStatesRef();
    });
    
    return unsubscribe;
  }, [store]);

  // Track which workspaces are currently retrying (prevent concurrent retries)
  const retryingRef = useRef<Set<string>>(new Set());

  /**
   * Check if a workspace is eligible for auto-resume
   * Idempotent - returns false if conditions aren't met
   */
  const isEligibleForResume = (workspaceId: string): boolean => {
    const state = workspaceStatesRef.current.get(workspaceId);
    if (!state) {
      return false;
    }

    // 1. Must have interrupted stream (not currently streaming)
    if (state.canInterrupt) return false; // Currently streaming

    if (!hasInterruptedStream(state.messages)) {
      return false;
    }

    // 2. Auto-retry must be enabled (user didn't press Ctrl+C)
    const autoRetry = readPersistedState<boolean>(getAutoRetryKey(workspaceId), true);
    if (!autoRetry) return false;

    // 3. Must not already be retrying
    if (retryingRef.current.has(workspaceId)) return false;

    // 4. Check exponential backoff timer
    const retryState = readPersistedState<RetryState>(
      getRetryStateKey(workspaceId),
      { attempt: 0, retryStartTime: Date.now() - INITIAL_DELAY } // Make immediately eligible on first check
    );

    const { attempt, retryStartTime } = retryState;
    const delay = Math.min(INITIAL_DELAY * Math.pow(2, attempt), MAX_DELAY);
    const timeSinceLastRetry = Date.now() - retryStartTime;

    if (timeSinceLastRetry < delay) return false; // Not time yet

    return true;
  };

  /**
   * Attempt to resume a workspace stream
   * Polling will check eligibility every 1 second
   */
  const attemptResume = async (workspaceId: string) => {
    if (!isEligibleForResume(workspaceId)) return;

    // Mark as retrying
    retryingRef.current.add(workspaceId);

    // Read current retry state
    const retryState = readPersistedState<RetryState>(getRetryStateKey(workspaceId), {
      attempt: 0,
      retryStartTime: Date.now(),
    });

    const { attempt } = retryState;

    try {
      const options = getSendOptionsFromStorage(workspaceId);
      const result = await window.api.workspace.resumeStream(workspaceId, options);

      if (!result.success) {
        // Increment attempt and reset timer for next retry
        const newState: RetryState = {
          attempt: attempt + 1,
          retryStartTime: Date.now(),
        };
        localStorage.setItem(getRetryStateKey(workspaceId), JSON.stringify(newState));
      } else {
        // Success - clear retry state entirely
        // If stream fails again, we'll start fresh (immediately eligible)
        localStorage.removeItem(getRetryStateKey(workspaceId));
      }
    } catch {
      // Increment attempt on error
      const newState: RetryState = {
        attempt: attempt + 1,
        retryStartTime: Date.now(),
      };
      localStorage.setItem(getRetryStateKey(workspaceId), JSON.stringify(newState));
    } finally {
      // Always clear retrying flag
      retryingRef.current.delete(workspaceId);
    }
  };

  useEffect(() => {
    // Initial scan on mount - check all workspaces for interrupted streams
    for (const [workspaceId] of workspaceStatesRef.current) {
      void attemptResume(workspaceId);
    }

    // Listen for resume check requests (primary mechanism)
    const handleResumeCheck = (event: Event) => {
      const customEvent = event as CustomEvent<{ workspaceId: string }>;
      const { workspaceId } = customEvent.detail;
      void attemptResume(workspaceId);
    };

    window.addEventListener(CUSTOM_EVENTS.RESUME_CHECK_REQUESTED, handleResumeCheck);

    // Backup polling mechanism - check all workspaces every 1 second
    // This is defense-in-depth in case events are missed
    const pollInterval = setInterval(() => {
      for (const [workspaceId] of workspaceStatesRef.current) {
        void attemptResume(workspaceId);
      }
    }, 1000);

    return () => {
      window.removeEventListener(CUSTOM_EVENTS.RESUME_CHECK_REQUESTED, handleResumeCheck);
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Stable effect - no deps, uses refs
}
