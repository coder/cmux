import React, { useState, useEffect, useRef, useCallback } from "react";
import styled from "@emotion/styled";
import { useSendMessageOptions } from "@/hooks/useSendMessageOptions";
import { usePersistedState } from "@/hooks/usePersistedState";
import { getRetryStateKey } from "@/constants/storage";

const BarrierContainer = styled.div`
  margin: 20px 0;
  padding: 16px 20px;
  background: linear-gradient(135deg, rgba(255, 165, 0, 0.1) 0%, rgba(255, 140, 0, 0.1) 100%);
  border-left: 4px solid var(--color-warning);
  border-radius: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
`;

const BarrierContent = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
`;

const Icon = styled.span`
  font-size: 18px;
  line-height: 1;
`;

const Message = styled.div`
  font-family: var(--font-primary);
  font-size: 13px;
  color: var(--color-text);
  font-weight: 500;
`;

const Countdown = styled.span`
  font-family: var(--font-monospace);
  font-weight: 600;
  color: var(--color-warning);
`;

const Button = styled.button<{ variant?: "primary" | "secondary" }>`
  background: ${(props) =>
    props.variant === "secondary" ? "transparent" : "var(--color-warning)"};
  border: ${(props) => (props.variant === "secondary" ? "1px solid var(--color-warning)" : "none")};
  border-radius: 4px;
  padding: 8px 16px;
  font-family: var(--font-primary);
  font-size: 12px;
  font-weight: 600;
  color: ${(props) => (props.variant === "secondary" ? "var(--color-warning)" : "var(--color-bg)")};
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: ${(props) =>
      props.variant === "secondary"
        ? "rgba(255, 165, 0, 0.1)"
        : "hsl(from var(--color-warning) h s calc(l * 1.2))"};
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

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
  totalRetryTime: number;
  retryStartTime: number;
}

const defaultRetryState: RetryState = {
  attempt: 0,
  totalRetryTime: 0,
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
  const [retryState, setRetryState] = usePersistedState<RetryState>(
    getRetryStateKey(workspaceId),
    defaultRetryState,
    { listener: true }
  );

  // Extract for convenience
  const { attempt, totalRetryTime, retryStartTime } = retryState;

  // Setters that update the persisted state
  const setAttempt = useCallback(
    (num: number) => setRetryState((prev) => ({ ...prev, attempt: num })),
    [setRetryState]
  );
  const setTotalRetryTime = useCallback(
    (time: number) => setRetryState((prev) => ({ ...prev, totalRetryTime: time })),
    [setRetryState]
  );
  const setRetryStartTime = useCallback(
    (time: number) => setRetryState((prev) => ({ ...prev, retryStartTime: time })),
    [setRetryState]
  );

  // Local state for UI (doesn't need to persist)
  const [countdown, setCountdown] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Get current send message options from shared hook
  // This ensures retry uses current settings, not historical ones
  const options = useSendMessageOptions(workspaceId);

  // Calculate delay with exponential backoff (capped at MAX_DELAY)
  const getDelay = useCallback((attemptNum: number) => {
    const exponentialDelay = INITIAL_DELAY * Math.pow(2, attemptNum);
    return Math.min(exponentialDelay, MAX_DELAY);
  }, []);

  // Cleanup timers
  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  // Start auto-retry with countdown (no max retries - continues indefinitely)
  const startAutoRetry = useCallback(
    (attemptNum: number) => {
      const delay = getDelay(attemptNum);
      const startTime = Date.now();
      const endTime = startTime + delay;

      // Update countdown every 100ms
      setCountdown(Math.ceil(delay / 1000));
      countdownIntervalRef.current = setInterval(() => {
        const remaining = endTime - Date.now();
        if (remaining <= 0) {
          clearInterval(countdownIntervalRef.current!);
          countdownIntervalRef.current = null;
          setCountdown(0);
        } else {
          setCountdown(Math.ceil(remaining / 1000));
        }
        // Update total retry time
        setTotalRetryTime(Math.floor((Date.now() - retryStartTime) / 1000));
      }, 100);

      // Schedule retry
      timerRef.current = setTimeout(() => {
        setIsRetrying(true);
        void (async () => {
          try {
            const result = await window.api.workspace.resumeStream(workspaceId, options);
            if (!result.success) {
              console.error("Auto-retry failed:", result.error);
              // Increment attempt and retry again
              setAttempt(attemptNum + 1);
              setIsRetrying(false);
            }
            // On success, the stream will start and component will unmount
          } catch (error) {
            console.error("Unexpected error during auto-retry:", error);
            // Increment attempt and retry again
            setAttempt(attemptNum + 1);
            setIsRetrying(false);
          }
        })();
      }, delay);
    },
    [workspaceId, options, getDelay, setAttempt, retryStartTime, setTotalRetryTime]
  );

  // Auto-retry effect
  useEffect(() => {
    if (autoRetry && !isRetrying) {
      startAutoRetry(attempt);
    }

    return () => {
      clearTimers();
    };
  }, [autoRetry, attempt, isRetrying, startAutoRetry, clearTimers]);

  // Manual retry handler
  const handleManualRetry = () => {
    setIsRetrying(true);
    setAttempt(0); // Reset attempt count
    setRetryStartTime(Date.now()); // Reset elapsed time tracking
    setTotalRetryTime(0);
    onResetAutoRetry(); // Re-enable auto-retry for next failure

    void (async () => {
      try {
        const result = await window.api.workspace.resumeStream(workspaceId, options);
        if (!result.success) {
          console.error("Manual retry failed:", result.error);
          setIsRetrying(false);
        }
        // On success, the stream will start and component will unmount
      } catch (error) {
        console.error("Unexpected error during manual retry:", error);
        setIsRetrying(false);
      }
    })();
  };

  // Stop auto-retry handler
  const handleStopAutoRetry = () => {
    clearTimers();
    setAttempt(0);
    setCountdown(0);
    setTotalRetryTime(0);
    onStopAutoRetry();
  };

  if (autoRetry) {
    // Auto-retry mode: Show countdown and stop button
    return (
      <BarrierContainer className={className}>
        <BarrierContent>
          <Icon>🔄</Icon>
          <Message>
            {isRetrying ? (
              <>
                Retrying... (attempt {attempt + 1})
                {totalRetryTime > 0 && ` • ${totalRetryTime}s elapsed`}
              </>
            ) : (
              <>
                Retrying in <Countdown>{countdown}s</Countdown> (attempt {attempt + 1})
                {totalRetryTime > 0 && ` • ${totalRetryTime}s elapsed`}
              </>
            )}
          </Message>
        </BarrierContent>
        <Button variant="secondary" onClick={handleStopAutoRetry} disabled={isRetrying}>
          Stop Auto-Retry
        </Button>
      </BarrierContainer>
    );
  } else {
    // Manual retry mode: Show retry button
    return (
      <BarrierContainer className={className}>
        <BarrierContent>
          <Icon>⚠️</Icon>
          <Message>Stream interrupted</Message>
        </BarrierContent>
        <Button onClick={handleManualRetry} disabled={isRetrying}>
          {isRetrying ? "Retrying..." : "Retry"}
        </Button>
      </BarrierContainer>
    );
  }
};
