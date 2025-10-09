import { useEffect, useRef } from "react";
import type { WorkspaceState } from "./useWorkspaceAggregators";
import { CUSTOM_EVENTS } from "@/constants/events";
import { getAutoRetryKey, getRetryStateKey } from "@/constants/storage";
import { getSendOptionsFromStorage } from "@/utils/messages/sendOptions";

interface RetryState {
  attempt: number;
  retryStartTime: number;
}

const INITIAL_DELAY = 1000; // 1 second
const MAX_DELAY = 60000; // 60 seconds

/**
 * Centralized auto-resume manager for interrupted streams
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
 */
export function useResumeManager(workspaceStates: Map<string, WorkspaceState>) {
  // Use ref to avoid effect re-running on every state change
  const workspaceStatesRef = useRef(workspaceStates);
  workspaceStatesRef.current = workspaceStates;

  // Track which workspaces are currently retrying (prevent concurrent retries)
  const retryingRef = useRef<Set<string>>(new Set());

  /**
   * Check if a workspace is eligible for auto-resume
   * Idempotent - returns false if conditions aren't met
   */
  const isEligibleForResume = (workspaceId: string): boolean => {
    const state = workspaceStatesRef.current.get(workspaceId);
    if (!state) return false;

    // 1. Must have interrupted stream (not currently streaming)
    if (state.canInterrupt) return false; // Currently streaming

    if (state.messages.length === 0) return false; // No messages

    const lastMessage = state.messages[state.messages.length - 1];
    const hasInterruptedStream =
      (lastMessage.type === "assistant" && lastMessage.isPartial) ||
      (lastMessage.type === "tool" && lastMessage.isPartial) ||
      (lastMessage.type === "reasoning" && lastMessage.isPartial);

    if (!hasInterruptedStream) return false;

    // 2. Auto-retry must be enabled (user didn't press Ctrl+C)
    const autoRetry = localStorage.getItem(getAutoRetryKey(workspaceId));
    if (autoRetry !== "true") return false;

    // 3. Must not already be retrying
    if (retryingRef.current.has(workspaceId)) return false;

    // 4. Check exponential backoff timer
    const retryStateJson = localStorage.getItem(getRetryStateKey(workspaceId));
    const retryState: RetryState = retryStateJson
      ? JSON.parse(retryStateJson)
      : { attempt: 0, retryStartTime: Date.now() - INITIAL_DELAY }; // Make immediately eligible on first check

    const { attempt, retryStartTime } = retryState;
    const delay = Math.min(INITIAL_DELAY * Math.pow(2, attempt), MAX_DELAY);
    const timeSinceLastRetry = Date.now() - retryStartTime;

    if (timeSinceLastRetry < delay) return false; // Not time yet

    return true;
  };

  /**
   * Attempt to resume a workspace stream
   * If not yet eligible due to backoff, schedules a retry
   */
  const attemptResume = async (workspaceId: string) => {
    const eligibility = isEligibleForResume(workspaceId);
    
    // If not eligible but should retry later, schedule it
    if (!eligibility.eligible && eligibility.scheduleRetryIn) {
      console.log(
        `[useResumeManager] Scheduling retry for ${workspaceId} in ${Math.ceil(eligibility.scheduleRetryIn / 1000)}s`
      );
      setTimeout(() => {
        void attemptResume(workspaceId);
      }, eligibility.scheduleRetryIn);
      return;
    }
    
    if (!eligibility.eligible) return;

    // Mark as retrying
    retryingRef.current.add(workspaceId);

    // Read current retry state
    const retryStateJson = localStorage.getItem(getRetryStateKey(workspaceId));
    const retryState: RetryState = retryStateJson
      ? JSON.parse(retryStateJson)
      : { attempt: 0, retryStartTime: Date.now() };

    const { attempt } = retryState;

    console.log(`[useResumeManager] Attempting resume for ${workspaceId} (attempt ${attempt + 1})`);

    try {
      const options = getSendOptionsFromStorage(workspaceId);
      const result = await window.api.workspace.resumeStream(workspaceId, options);

      if (!result.success) {
        console.error(`[useResumeManager] Resume failed for ${workspaceId}:`, result.error);
        // Increment attempt and reset timer
        const newState: RetryState = {
          attempt: attempt + 1,
          retryStartTime: Date.now(),
        };
        localStorage.setItem(getRetryStateKey(workspaceId), JSON.stringify(newState));
      } else {
        console.log(`[useResumeManager] Resume succeeded for ${workspaceId}`);
        // Success - reset retry state for next failure
        const newState: RetryState = {
          attempt: 0,
          retryStartTime: Date.now(),
        };
        localStorage.setItem(getRetryStateKey(workspaceId), JSON.stringify(newState));
      }
    } catch (error) {
      console.error(`[useResumeManager] Unexpected error resuming ${workspaceId}:`, error);
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
    const workspaceIds = Array.from(workspaceStatesRef.current.keys());
    console.log("[useResumeManager] Initial scan on mount for workspaces:", workspaceIds);
    for (const [workspaceId] of workspaceStatesRef.current) {
      void attemptResume(workspaceId);
    }

    // Listen for resume check requests (primary mechanism)
    const handleResumeCheck = (event: Event) => {
      const customEvent = event as CustomEvent<{ workspaceId: string }>;
      const { workspaceId } = customEvent.detail;
      console.log(`[useResumeManager] Resume check requested for ${workspaceId}`);
      void attemptResume(workspaceId);
    };

    window.addEventListener(CUSTOM_EVENTS.RESUME_CHECK_REQUESTED, handleResumeCheck);

    // Backup polling mechanism - check all workspaces every 1 second
    // This is defense-in-depth in case events are missed
    let pollCount = 0;
    const pollInterval = setInterval(() => {
      pollCount++;
      const workspaceIds = Array.from(workspaceStatesRef.current.keys());
      if (pollCount === 1 || pollCount % 10 === 0) {
        console.log(
          `[useResumeManager] Polling check #${pollCount} for workspaces:`,
          workspaceIds
        );
      }
      for (const [workspaceId] of workspaceStatesRef.current) {
        void attemptResume(workspaceId);
      }
    }, 1000);

    return () => {
      window.removeEventListener(CUSTOM_EVENTS.RESUME_CHECK_REQUESTED, handleResumeCheck);
      clearInterval(pollInterval);
    };
  }, []); // Stable effect - no deps, uses refs
}
