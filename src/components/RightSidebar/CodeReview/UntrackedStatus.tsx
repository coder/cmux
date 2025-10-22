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
            ? "bg-[#3e2a00] border border-[#806000] text-[#ffb347] cursor-pointer hover:bg-[#4a3200] hover:border-[#a07000]"
            : "bg-transparent border border-transparent text-[#888] cursor-default"
        )}
        onClick={() => hasUntracked && setShowTooltip(!showTooltip)}
      >
        {isLoading ? "..." : `${count} Untracked`}
      </div>

      {showTooltip && hasUntracked && (
        <div className="absolute top-[calc(100%+8px)] right-0 bg-[#2d2d30] border border-[#454545] rounded p-2 min-w-[200px] max-w-[400px] z-[1000] shadow-[0_4px_12px_rgba(0,0,0,0.3)] animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="text-[11px] font-semibold text-[#ccc] mb-2 pb-1.5 border-b border-[#3e3e42]">
            Untracked Files ({count})
          </div>
          <div className="max-h-[200px] overflow-y-auto mb-2">
            {untrackedFiles.map((file) => (
              <div
                key={file}
                className="text-[11px] text-[#aaa] py-0.5 px-1 font-[var(--font-monospace)] whitespace-nowrap overflow-hidden text-ellipsis hover:bg-[#37373d]"
              >
                {file}
              </div>
            ))}
          </div>
          <button
            onClick={() => void handleTrackAll()}
            disabled={isTracking}
            className={cn(
              "w-full py-1 px-2 bg-transparent text-[#888] border border-[#444] rounded text-[11px] cursor-pointer transition-all duration-200 font-[var(--font-primary)]",
              "hover:bg-[rgba(255,255,255,0.05)] hover:text-[#ccc] hover:border-[#666]",
              "active:bg-[rgba(255,255,255,0.1)]",
              "disabled:text-[#555] disabled:border-[#333] disabled:cursor-not-allowed disabled:bg-transparent"
            )}
          >
            {isTracking ? "Tracking..." : "Track All"}
          </button>
        </div>
      )}
    </div>
  );
};
