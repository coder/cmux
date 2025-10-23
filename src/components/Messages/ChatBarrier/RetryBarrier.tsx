import React, { useState, useEffect, useCallback } from "react";
import { usePersistedState } from "@/hooks/usePersistedState";
import { getRetryStateKey } from "@/constants/storage";
import { CUSTOM_EVENTS } from "@/constants/events";
import { cn } from "@/lib/utils";

interface RetryBarrierProps {
  workspaceId: string;
  autoRetry: boolean;
  onStopAutoRetry: () => void;
  onResetAutoRetry: () => void;
  className?: string;
}

const INITIAL_DELAY = 1000; // 1 second
const MAX_DELAY = 60000; // 60 seconds (cap for exponential backoff)

interface RetryState {
  attempt: number;
  retryStartTime: number;
}

const defaultRetryState: RetryState = {
  attempt: 0,
  retryStartTime: Date.now(),
};

export const RetryBarrier: React.FC<RetryBarrierProps> = ({
  workspaceId,
  autoRetry,
  onStopAutoRetry,
  onResetAutoRetry,
  className,
}) => {
  // Use persisted state for retry tracking (survives workspace switches)
  // Read retry state (managed by useResumeManager)
  const [retryState] = usePersistedState<RetryState>(
    getRetryStateKey(workspaceId),
    defaultRetryState,
    { listener: true }
  );

  const { attempt, retryStartTime } = retryState;

  // Local state for UI
  const [countdown, setCountdown] = useState(0);

  // Calculate delay with exponential backoff (same as useResumeManager)
  const getDelay = useCallback((attemptNum: number) => {
    const exponentialDelay = INITIAL_DELAY * Math.pow(2, attemptNum);
    return Math.min(exponentialDelay, MAX_DELAY);
  }, []);

  // Update countdown display (pure display logic, no side effects)
  // useResumeManager handles the actual retry logic
  useEffect(() => {
    if (!autoRetry) return;

    const interval = setInterval(() => {
      const delay = getDelay(attempt);
      const nextRetryTime = retryStartTime + delay;
      const timeUntilRetry = Math.max(0, nextRetryTime - Date.now());

      setCountdown(Math.ceil(timeUntilRetry / 1000));
    }, 100);

    return () => clearInterval(interval);
  }, [autoRetry, attempt, retryStartTime, getDelay]);

  // Manual retry handler (user-initiated, immediate)
  // Emits event to useResumeManager instead of calling resumeStream directly
  // This keeps all retry logic centralized in one place
  const handleManualRetry = () => {
    onResetAutoRetry(); // Re-enable auto-retry for next failure

    // Clear retry state to make workspace immediately eligible for resume
    // (no retryState = defaults to immediately eligible in useResumeManager)
    localStorage.removeItem(getRetryStateKey(workspaceId));

    // Emit event to useResumeManager - it will handle the actual resume
    window.dispatchEvent(
      new CustomEvent(CUSTOM_EVENTS.RESUME_CHECK_REQUESTED, {
        detail: { workspaceId },
      })
    );
  };

  // Stop auto-retry handler
  const handleStopAutoRetry = () => {
    setCountdown(0);
    onStopAutoRetry();
  };

  if (autoRetry) {
    // Auto-retry mode: Show countdown and stop button
    // useResumeManager handles the actual retry logic
    return (
      <div
        className={cn(
          "my-5 px-5 py-4 bg-gradient-to-br from-[rgba(255,165,0,0.1)] to-[rgba(255,140,0,0.1)] border-l-4 border-warning rounded flex justify-between items-center gap-4",
          className
        )}
      >
        <div className="flex flex-1 items-center gap-3">
          <span className="text-lg leading-none">🔄</span>
          <div className="font-primary text-[13px] font-medium text-gray-200">
            {countdown === 0 ? (
              <>Retrying... (attempt {attempt + 1})</>
            ) : (
              <>
                Retrying in{" "}
                <span className="text-warning font-mono font-semibold">{countdown}s</span> (attempt{" "}
                {attempt + 1})
              </>
            )}
          </div>
        </div>
        <button
          className="border-warning font-primary text-warning hover:bg-warning-overlay cursor-pointer rounded border bg-transparent px-4 py-2 text-xs font-semibold whitespace-nowrap transition-all duration-200 hover:-translate-y-px active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleStopAutoRetry}
        >
          Stop Auto-Retry
        </button>
      </div>
    );
  } else {
    // Manual retry mode: Show retry button
    return (
      <div
        className={cn(
          "my-5 px-5 py-4 bg-gradient-to-br from-[rgba(255,165,0,0.1)] to-[rgba(255,140,0,0.1)] border-l-4 border-warning rounded flex justify-between items-center gap-4",
          className
        )}
      >
        <div className="flex flex-1 items-center gap-3">
          <span className="text-lg leading-none">⚠️</span>
          <div className="font-primary text-[13px] font-medium text-gray-200">
            Stream interrupted
          </div>
        </div>
        <button
          className="bg-warning font-primary text-background cursor-pointer rounded border-none px-4 py-2 text-xs font-semibold whitespace-nowrap transition-all duration-200 hover:-translate-y-px hover:brightness-120 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={handleManualRetry}
        >
          Retry
        </button>
      </div>
    );
  }
};
