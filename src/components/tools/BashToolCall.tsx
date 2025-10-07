import React, { useState, useEffect, useRef } from "react";
import type { BashToolArgs, BashToolResult } from "@/types/tools";
import {
  ToolContainer,
  ToolHeader,
  ExpandIcon,
  ToolName,
  StatusIndicator,
  ToolDetails,
  DetailSection,
  DetailLabel,
  DetailContent,
  LoadingDots,
} from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay, type ToolStatus } from "./shared/toolUtils";
import styles from "./BashToolCall.module.css";

interface BashToolCallProps {
  args: BashToolArgs;
  result?: BashToolResult;
  status?: ToolStatus;
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${Math.round(ms / 1000)}s`;
}

export const BashToolCall: React.FC<BashToolCallProps> = ({ args, result, status = "pending" }) => {
  const { expanded, toggleExpanded } = useToolExpansion();
  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number>(Date.now());

  // Track elapsed time for pending/executing status
  useEffect(() => {
    if (status === "executing" || status === "pending") {
      startTimeRef.current = Date.now();
      setElapsedTime(0);

      const timer = setInterval(() => {
        setElapsedTime(Date.now() - startTimeRef.current);
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [status]);

  const isPending = status === "executing" || status === "pending";

  return (
    <ToolContainer expanded={expanded}>
      <ToolHeader onClick={toggleExpanded}>
        <ExpandIcon expanded={expanded}>▶</ExpandIcon>
        <ToolName>bash</ToolName>
        <span className={styles.scriptPreview}>{args.script}</span>
        <span className={`${styles.timeoutInfo} ${isPending ? styles.active : ""}`}>
          timeout: {args.timeout_secs}s
          {result && ` • took ${formatDuration(result.wall_duration_ms)}`}
          {!result && isPending && elapsedTime > 0 && ` • ${formatDuration(elapsedTime)}`}
        </span>
        {result && (
          <span
            className={`${styles.exitCodeBadge} ${result.exitCode === 0 ? styles.success : styles.failure}`}
          >
            {result.exitCode}
          </span>
        )}
        <StatusIndicator status={status}>{getStatusDisplay(status)}</StatusIndicator>
      </ToolHeader>

      {expanded && (
        <ToolDetails>
          <DetailSection>
            <DetailLabel>Script</DetailLabel>
            <DetailContent>{args.script}</DetailContent>
          </DetailSection>

          {result && (
            <>
              {result.success === false && result.error && (
                <DetailSection>
                  <DetailLabel>Error</DetailLabel>
                  <div className={styles.errorMessage}>{result.error}</div>
                </DetailSection>
              )}

              {result.output && (
                <DetailSection>
                  <DetailLabel>Output</DetailLabel>
                  <pre className={styles.outputBlock}>{result.output}</pre>
                </DetailSection>
              )}
            </>
          )}

          {status === "executing" && !result && (
            <DetailSection>
              <DetailContent>
                Waiting for result
                <LoadingDots />
              </DetailContent>
            </DetailSection>
          )}
        </ToolDetails>
      )}
    </ToolContainer>
  );
};
