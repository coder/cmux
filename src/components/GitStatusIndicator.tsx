import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GitStatus } from "@/types/workspace";
import { GitStatusIndicatorView } from "./GitStatusIndicatorView";
import { useGitBranchDetails } from "./hooks/useGitBranchDetails";
import { assert } from "@/utils/assert";
import { getSendOptionsFromStorage } from "@/utils/messages/sendOptions";

interface GitStatusIndicatorProps {
  gitStatus: GitStatus | null;
  workspaceId: string;
  tooltipPosition?: "right" | "bottom";
  isStreaming?: boolean;
}

/**
 * Container component for git status indicator.
 * Manages tooltip visibility, positioning, data fetching, and auto-rebase UX.
 * Delegates rendering to GitStatusIndicatorView.
 */
export const GitStatusIndicator: React.FC<GitStatusIndicatorProps> = ({
  gitStatus,
  workspaceId,
  tooltipPosition = "right",
  isStreaming = false,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipCoords, setTooltipCoords] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const [isRebasing, setIsRebasing] = useState(false);
  const [rebaseError, setRebaseError] = useState<string | null>(null);
  const [isAgentResolving, setIsAgentResolving] = useState(false);
  const [agentConflictFiles, setAgentConflictFiles] = useState<string[]>([]);

  const trimmedWorkspaceId = workspaceId.trim();
  assert(
    trimmedWorkspaceId.length > 0,
    "GitStatusIndicator requires workspaceId to be a non-empty string."
  );

  const { branchHeaders, commits, dirtyFiles, isLoading, errorMessage, invalidateCache, refresh } =
    useGitBranchDetails(trimmedWorkspaceId, gitStatus, showTooltip);

  // Get send message options to pass to auto-triggered agent on rebase failure
  // Uses storage directly (no context) to work in sidebar without ThinkingProvider
  const sendMessageOptions = useMemo(
    () => getSendOptionsFromStorage(trimmedWorkspaceId),
    [trimmedWorkspaceId]
  );

  const cancelHideTimeout = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  const handleMouseEnter = () => {
    cancelHideTimeout();
    setShowTooltip(true);

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();

      if (tooltipPosition === "right") {
        setTooltipCoords({
          top: rect.top + rect.height / 2,
          left: rect.right + 8,
        });
      } else {
        setTooltipCoords({
          top: rect.bottom + 8,
          left: rect.left,
        });
      }
    }
  };

  const handleMouseLeave = () => {
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false);
    }, 300);
  };

  const handleTooltipMouseEnter = () => {
    cancelHideTimeout();
  };

  const handleTooltipMouseLeave = () => {
    setShowTooltip(false);
  };

  const handleContainerRef = (el: HTMLSpanElement | null) => {
    containerRef.current = el;
  };

  const canRebase = !!gitStatus && gitStatus.behind > 0 && !isStreaming && !isRebasing;

  const handleRebaseClick = useCallback(async () => {
    if (!gitStatus || gitStatus.behind <= 0 || isStreaming || isRebasing) {
      return;
    }

    setIsRebasing(true);
    setRebaseError(null);

    try {
      const result = await window.api?.workspace?.rebase?.(trimmedWorkspaceId, sendMessageOptions);

      assert(
        typeof result !== "undefined",
        "workspace.rebase IPC handler must exist before attempting auto-rebase."
      );

      if (!result) {
        setRebaseError("Auto-rebase unavailable: workspace IPC handler missing.");
        return;
      }

      if (result.success) {
        invalidateCache();
        if (showTooltip) {
          refresh();
        }
        return;
      }

      invalidateCache();

      // If agent is resolving, don't show error - let user know agent is working
      if (result.status === "resolving") {
        setIsAgentResolving(true);
        setAgentConflictFiles(result.conflictFiles ?? []);
        // Don't show error - agent is handling it
        return;
      }

      // Only show errors for conflicts/aborted if agent is NOT resolving
      if (result.status === "conflicts") {
        setRebaseError(
          result.error ??
            "Rebase hit conflicts. Check the chat for details and resolve before continuing."
        );
      } else {
        setRebaseError(result.error ?? "Rebase failed unexpectedly.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setRebaseError(`Failed to rebase: ${message}`);
    } finally {
      setIsRebasing(false);
    }
  }, [
    gitStatus,
    invalidateCache,
    isRebasing,
    isStreaming,
    refresh,
    showTooltip,
    trimmedWorkspaceId,
    sendMessageOptions,
  ]);

  const triggerRebase = useCallback(() => {
    void handleRebaseClick();
  }, [handleRebaseClick]);

  useEffect(() => {
    return () => {
      cancelHideTimeout();
    };
  }, []);

  useEffect(() => {
    if (gitStatus?.behind === 0) {
      setRebaseError(null);
    }
  }, [gitStatus]);

  // Clear resolving state when agent finishes (streaming stops)
  useEffect(() => {
    if (isAgentResolving && !isStreaming) {
      // Agent finished streaming - check if rebase succeeded
      setIsAgentResolving(false);
      setAgentConflictFiles([]); // Clear conflict files

      // If still behind after agent finished, it failed to resolve
      if (gitStatus && gitStatus.behind > 0) {
        setRebaseError("Agent couldn't fully resolve the conflicts. Check chat for details.");
      }
      // If behind === 0, agent succeeded - git status effect will clear error
    }
  }, [isAgentResolving, isStreaming, gitStatus]);

  return (
    <GitStatusIndicatorView
      gitStatus={gitStatus}
      tooltipPosition={tooltipPosition}
      branchHeaders={branchHeaders}
      commits={commits}
      dirtyFiles={dirtyFiles}
      isLoading={isLoading}
      errorMessage={errorMessage}
      showTooltip={showTooltip}
      tooltipCoords={tooltipCoords}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTooltipMouseEnter={handleTooltipMouseEnter}
      onTooltipMouseLeave={handleTooltipMouseLeave}
      onContainerRef={handleContainerRef}
      canRebase={canRebase}
      isRebasing={isRebasing}
      isAgentResolving={isAgentResolving}
      agentConflictFiles={isAgentResolving ? agentConflictFiles : null}
      onRebaseClick={triggerRebase}
      rebaseError={rebaseError}
    />
  );
};
