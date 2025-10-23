/**
 * UntrackedStatus - Shows untracked files count with interactive tooltip
 */

import React, { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface UntrackedStatusProps {
  workspaceId: string;
  workspacePath: string;
  refreshTrigger?: number;
  onRefresh?: () => void;
}

export const UntrackedStatus: React.FC<UntrackedStatusProps> = ({
  workspaceId,
  workspacePath,
  refreshTrigger,
  onRefresh,
}) => {
  const [untrackedFiles, setUntrackedFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const hasLoadedOnce = useRef(false);
  const loadingRef = useRef(false); // Prevent concurrent loads

  // Load untracked files
  useEffect(() => {
    let cancelled = false;

    const loadUntracked = async () => {
      // Prevent concurrent loads
      if (loadingRef.current) return;
      loadingRef.current = true;

      // Only show loading on first load ever, not on subsequent refreshes
      if (!hasLoadedOnce.current) {
        setIsLoading(true);
      }

      try {
        const result = await window.api.workspace.executeBash(
          workspaceId,
          "git ls-files --others --exclude-standard",
          { timeout_secs: 5 }
        );

        if (cancelled) return;

        if (result.success) {
          const files = (result.data.output ?? "")
            .split("\n")
            .map((f) => f.trim())
            .filter(Boolean);
          setUntrackedFiles(files);
        }

        hasLoadedOnce.current = true;
      } catch (err) {
        console.error("Failed to load untracked files:", err);
      } finally {
        loadingRef.current = false;
        setIsLoading(false);
      }
    };

    void loadUntracked();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, workspacePath, refreshTrigger]);

  // Close tooltip when clicking outside
  useEffect(() => {
    if (!showTooltip) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTooltip]);

  const handleTrackAll = async () => {
    if (untrackedFiles.length === 0 || isTracking) return;

    setIsTracking(true);
    try {
      // Use git add with -- to treat all arguments as file paths
      // Escape single quotes by replacing ' with '\'' for safe shell quoting
      const escapedFiles = untrackedFiles.map((f) => `'${f.replace(/'/g, "'\\''")}'`).join(" ");
      const result = await window.api.workspace.executeBash(
        workspaceId,
        `git add -- ${escapedFiles}`,
        { timeout_secs: 10 }
      );

      if (result.success) {
        // Close tooltip first
        setShowTooltip(false);
        // Trigger refresh - this will reload untracked files from git
        // Don't clear untrackedFiles optimistically to avoid flicker
        onRefresh?.();
      } else {
        console.error("Failed to track files:", result.error);
      }
    } catch (err) {
      console.error("Failed to track files:", err);
    } finally {
      setIsTracking(false);
    }
  };

  const count = untrackedFiles.length;
  const hasUntracked = count > 0;

  return (
    <div ref={containerRef} className="relative inline-block">
      <div
        className={cn(
          "py-1 px-2.5 rounded font-medium text-[11px] whitespace-nowrap transition-all duration-200",
          hasUntracked
            ? "bg-review-bg-warning border border-review-warning text-info-yellow cursor-pointer hover:bg-review-warning-light hover:border-review-warning-medium"
            : "bg-transparent border border-transparent text-gray-500 cursor-default"
        )}
        onClick={() => hasUntracked && setShowTooltip(!showTooltip)}
      >
        {isLoading ? "..." : `${count} Untracked`}
      </div>

      {showTooltip && hasUntracked && (
        <div className="border-bg-medium animate-in fade-in slide-in-from-top-1 absolute top-[calc(100%+8px)] right-0 z-[1000] max-w-96 min-w-48 rounded border bg-gray-900 p-2 shadow-[0_4px_12px_rgba(0,0,0,0.3)] duration-150">
          <div className="mb-2 border-b border-gray-800 pb-1.5 text-[11px] font-semibold text-gray-200">
            Untracked Files ({count})
          </div>
          <div className="mb-2 max-h-[200px] overflow-y-auto">
            {untrackedFiles.map((file) => (
              <div
                key={file}
                className="hover:bg-bg-subtle truncate px-1 py-0.5 font-mono text-[11px] text-gray-400"
              >
                {file}
              </div>
            ))}
          </div>
          <button
            onClick={() => void handleTrackAll()}
            disabled={isTracking}
            className={cn(
              "w-full py-1 px-2 bg-transparent text-gray-500 border border-gray-800-medium rounded text-[11px] cursor-pointer transition-all duration-200 font-primary",
              "hover:bg-white-overlay-light hover:text-gray-200 hover:border-gray-800-subtle",
              "active:bg-white-overlay",
              "disabled:text-border-darker disabled:border-gray-800 disabled:cursor-not-allowed disabled:bg-transparent"
            )}
          >
            {isTracking ? "Tracking..." : "Track All"}
          </button>
        </div>
      )}
    </div>
  );
};
