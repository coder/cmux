import React, { useState, useEffect, useCallback } from "react";
import styled from "@emotion/styled";
import { usePersistedState } from "@/hooks/usePersistedState";
import { getRetryStateKey } from "@/constants/storage";
import { CUSTOM_EVENTS } from "@/constants/events";

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
      <BarrierContainer className={className}>
        <BarrierContent>
          <Icon>🔄</Icon>
          <Message>
            {countdown === 0 ? (
              <>Retrying... (attempt {attempt + 1})</>
            ) : (
              <>
                Retrying in <Countdown>{countdown}s</Countdown> (attempt {attempt + 1})
              </>
            )}
          </Message>
        </BarrierContent>
        <Button variant="secondary" onClick={handleStopAutoRetry}>
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
        <Button onClick={handleManualRetry}>Retry</Button>
      </BarrierContainer>
    );
  }
};
