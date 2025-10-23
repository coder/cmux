/**
 * ReviewPanel - Main code review interface
 * Displays diff hunks for viewing changes in the workspace
 *
 * FILTERING ARCHITECTURE:
 *
 * Two-tier pipeline:
 *
 * 1. Git-level filters (affect data fetching):
 *    - diffBase: target branch/commit to diff against
 *    - includeUncommitted: include working directory changes
 *    - selectedFilePath: CRITICAL for truncation handling - when full diff
 *      exceeds bash output limits, path filter retrieves specific files
 *
 * 2. Frontend filters (applied in-memory to loaded hunks):
 *    - showReadHunks: hide hunks marked as reviewed
 *    - searchTerm: substring match on filenames + hunk content
 *
 * Why hybrid? Performance and necessity:
 * - selectedFilePath MUST be git-level (truncation recovery)
 * - search/read filters are better frontend (more flexible, simpler UX)
 * - Frontend filtering is fast even for 1000+ hunks (<5ms)
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { HunkViewer } from "./HunkViewer";
import { ReviewControls } from "./ReviewControls";
import { FileTree } from "./FileTree";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useReviewState } from "@/hooks/useReviewState";
import { parseDiff, extractAllHunks } from "@/utils/git/diffParser";
import { getReviewSearchStateKey } from "@/constants/storage";
import { Tooltip, TooltipWrapper } from "@/components/Tooltip";
import { parseNumstat, buildFileTree, extractNewPath } from "@/utils/git/numstatParser";
import type { DiffHunk, ReviewFilters as ReviewFiltersType } from "@/types/review";
import type { FileTreeNode } from "@/utils/git/numstatParser";
import { matchesKeybind, KEYBINDS, formatKeybind } from "@/utils/ui/keybinds";
import { applyFrontendFilters } from "@/utils/review/filterHunks";
import { cn } from "@/lib/utils";

interface ReviewPanelProps {
  workspaceId: string;
  workspacePath: string;
  onReviewNote?: (note: string) => void;
  /** Trigger to focus panel (increment to trigger) */
  focusTrigger?: number;
}

interface ReviewSearchState {
  input: string;
  useRegex: boolean;
  matchCase: boolean;
}

interface DiagnosticInfo {
  command: string;
  outputLength: number;
  fileDiffCount: number;
  hunkCount: number;
}

/**
 * Build git diff command based on diffBase and includeUncommitted flag
 * Shared logic between numstat (file tree) and diff (hunks) commands
 * Exported for testing
 *
 * Git diff semantics:
 * - `git diff A...HEAD` (three-dot): Shows commits on current branch since branching from A
 *   → Uses merge-base(A, HEAD) as comparison point, so changes to A after branching don't appear
 * - `git diff $(git merge-base A HEAD)`: Shows all changes from branch point to working directory
 *   → Includes both committed changes on the branch AND uncommitted working directory changes
 *   → Single unified diff (no duplicate hunks from concatenation)
 * - `git diff HEAD`: Shows only uncommitted changes (working directory vs HEAD)
 * - `git diff --staged`: Shows only staged changes (index vs HEAD)
 *
 * The key insight: When includeUncommitted is true, we compare from the merge-base directly
 * to the working directory. This gives a stable comparison point (doesn't change when base
 * ref moves forward) while including both committed and uncommitted work in a single diff.
 *
 * @param diffBase - Base reference ("main", "HEAD", "--staged")
 * @param includeUncommitted - Include uncommitted working directory changes
 * @param pathFilter - Optional path filter (e.g., ' -- "src/foo.ts"')
 * @param command - "diff" (unified) or "numstat" (file stats)
 */
export function buildGitDiffCommand(
  diffBase: string,
  includeUncommitted: boolean,
  pathFilter: string,
  command: "diff" | "numstat"
): string {
  const flags = command === "numstat" ? " -M --numstat" : " -M";

  if (diffBase === "--staged") {
    // Staged changes, optionally with unstaged appended as separate diff
    const base = `git diff --staged${flags}${pathFilter}`;
    return includeUncommitted ? `${base} && git diff HEAD${flags}${pathFilter}` : base;
  }

  if (diffBase === "HEAD") {
    // Uncommitted changes only (working vs HEAD)
    return `git diff HEAD${flags}${pathFilter}`;
  }

  // Branch diff: use three-dot for committed only, or merge-base for committed+uncommitted
  if (includeUncommitted) {
    // Use merge-base to get a unified diff from branch point to working directory
    // This includes both committed changes on the branch AND uncommitted working changes
    // Single command avoids duplicate hunks from concatenation
    // Stable comparison point: merge-base doesn't change when diffBase ref moves forward
    return `git diff $(git merge-base ${diffBase} HEAD)${flags}${pathFilter}`;
  } else {
    // Three-dot: committed changes only (merge-base to HEAD)
    return `git diff ${diffBase}...HEAD${flags}${pathFilter}`;
  }
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({
  workspaceId,
  workspacePath,
  onReviewNote,
  focusTrigger,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [hunks, setHunks] = useState<DiffHunk[]>([]);
  const [selectedHunkId, setSelectedHunkId] = useState<string | null>(null);
  const [isLoadingHunks, setIsLoadingHunks] = useState(true);
  const [isLoadingTree, setIsLoadingTree] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diagnosticInfo, setDiagnosticInfo] = useState<DiagnosticInfo | null>(null);
  const [truncationWarning, setTruncationWarning] = useState<string | null>(null);
  const [isPanelFocused, setIsPanelFocused] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [fileTree, setFileTree] = useState<FileTreeNode | null>(null);
  // Map of hunkId -> toggle function for expand/collapse
  const toggleExpandFnsRef = useRef<Map<string, () => void>>(new Map());

  // Unified search state (per-workspace persistence)
  const [searchState, setSearchState] = usePersistedState<ReviewSearchState>(
    getReviewSearchStateKey(workspaceId),
    { input: "", useRegex: false, matchCase: false }
  );
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");

  // Persist file filter per workspace
  const [selectedFilePath, setSelectedFilePath] = usePersistedState<string | null>(
    `review-file-filter:${workspaceId}`,
    null
  );

  // Global default base (shared across all workspaces)
  const [defaultBase] = usePersistedState<string>("review-default-base", "HEAD");

  // Persist diff base per workspace (falls back to global default)
  const [diffBase, setDiffBase] = usePersistedState(`review-diff-base:${workspaceId}`, defaultBase);

  // Persist includeUncommitted flag per workspace
  const [includeUncommitted, setIncludeUncommitted] = usePersistedState(
    `review-include-uncommitted:${workspaceId}`,
    false
  );

  // Persist showReadHunks flag per workspace
  const [showReadHunks, setShowReadHunks] = usePersistedState(
    `review-show-read:${workspaceId}`,
    true
  );

  // Initialize review state hook
  const { isRead, toggleRead } = useReviewState(workspaceId);

  const [filters, setFilters] = useState<ReviewFiltersType>({
    showReadHunks: showReadHunks,
    diffBase: diffBase,
    includeUncommitted: includeUncommitted,
  });

  // Focus panel when focusTrigger changes (preserves current hunk selection)
  useEffect(() => {
    if (focusTrigger && focusTrigger > 0) {
      panelRef.current?.focus();
    }
  }, [focusTrigger]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchState.input);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchState.input]);

  // Load file tree - when workspace, diffBase, or refreshTrigger changes
  useEffect(() => {
    let cancelled = false;

    const loadFileTree = async () => {
      setIsLoadingTree(true);
      try {
        const numstatCommand = buildGitDiffCommand(
          filters.diffBase,
          filters.includeUncommitted,
          "", // No path filter for file tree
          "numstat"
        );

        const numstatResult = await window.api.workspace.executeBash(workspaceId, numstatCommand, {
          timeout_secs: 30,
        });

        if (cancelled) return;

        if (numstatResult.success) {
          const numstatOutput = numstatResult.data.output ?? "";
          const fileStats = parseNumstat(numstatOutput);

          // Build tree with original paths (needed for git commands)
          const tree = buildFileTree(fileStats);
          setFileTree(tree);
        }
      } catch (err) {
        console.error("Failed to load file tree:", err);
      } finally {
        setIsLoadingTree(false);
      }
    };

    void loadFileTree();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, workspacePath, filters.diffBase, filters.includeUncommitted, refreshTrigger]);

  // Load diff hunks - when workspace, diffBase, selected path, or refreshTrigger changes
  useEffect(() => {
    let cancelled = false;

    const loadDiff = async () => {
      setIsLoadingHunks(true);
      setError(null);
      setTruncationWarning(null);
      try {
        // Git-level filters (affect what data is fetched):
        // - diffBase: what to diff against
        // - includeUncommitted: include working directory changes
        // - selectedFilePath: ESSENTIAL for truncation - if full diff is cut off,
        //   path filter lets us retrieve specific file's hunks
        const pathFilter = selectedFilePath ? ` -- "${extractNewPath(selectedFilePath)}"` : "";

        const diffCommand = buildGitDiffCommand(
          filters.diffBase,
          filters.includeUncommitted,
          pathFilter,
          "diff"
        );

        // Fetch diff
        const diffResult = await window.api.workspace.executeBash(workspaceId, diffCommand, {
          timeout_secs: 30,
        });

        if (cancelled) return;

        if (!diffResult.success) {
          // Real error (not truncation-related)
          console.error("Git diff failed:", diffResult.error);
          setError(diffResult.error);
          setHunks([]);
          setDiagnosticInfo(null);
          return;
        }

        const diffOutput = diffResult.data.output ?? "";
        const truncationInfo = diffResult.data.truncated;

        const fileDiffs = parseDiff(diffOutput);
        const allHunks = extractAllHunks(fileDiffs);

        // Store diagnostic info
        setDiagnosticInfo({
          command: diffCommand,
          outputLength: diffOutput.length,
          fileDiffCount: fileDiffs.length,
          hunkCount: allHunks.length,
        });

        // Set truncation warning only when not filtering by path
        if (truncationInfo && !selectedFilePath) {
          setTruncationWarning(
            `Diff truncated (${truncationInfo.reason}). Filter by file to see more.`
          );
        }

        setHunks(allHunks);

        // Auto-select first hunk if none selected
        if (allHunks.length > 0 && !selectedHunkId) {
          setSelectedHunkId(allHunks[0].id);
        }
      } catch (err) {
        const errorMsg = `Failed to load diff: ${err instanceof Error ? err.message : String(err)}`;
        console.error(errorMsg);
        setError(errorMsg);
      } finally {
        setIsLoadingHunks(false);
      }
    };

    void loadDiff();

    return () => {
      cancelled = true;
    };
    // selectedHunkId intentionally omitted - only auto-select on initial load, not on every selection change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    workspaceId,
    workspacePath,
    filters.diffBase,
    filters.includeUncommitted,
    selectedFilePath,
    refreshTrigger,
  ]);

  // Persist diffBase when it changes
  useEffect(() => {
    setDiffBase(filters.diffBase);
  }, [filters.diffBase, setDiffBase]);

  // Persist includeUncommitted when it changes
  useEffect(() => {
    setIncludeUncommitted(filters.includeUncommitted);
  }, [filters.includeUncommitted, setIncludeUncommitted]);

  // Persist showReadHunks when it changes
  useEffect(() => {
    setShowReadHunks(filters.showReadHunks);
  }, [filters.showReadHunks, setShowReadHunks]);

  // Get read status for a file
  const getFileReadStatus = useCallback(
    (filePath: string) => {
      const fileHunks = hunks.filter((h) => h.filePath === filePath);
      if (fileHunks.length === 0) {
        return null; // Unknown state - no hunks loaded for this file
      }
      const total = fileHunks.length;
      const read = fileHunks.filter((h) => isRead(h.id)).length;
      return { total, read };
    },
    [hunks, isRead]
  );

  // Apply frontend filters (read state, search term)
  // Note: selectedFilePath is a git-level filter, applied when fetching hunks
  const filteredHunks = useMemo(() => {
    return applyFrontendFilters(hunks, {
      showReadHunks: filters.showReadHunks,
      isRead,
      searchTerm: debouncedSearchTerm,
      useRegex: searchState.useRegex,
      matchCase: searchState.matchCase,
    });
  }, [
    hunks,
    filters.showReadHunks,
    isRead,
    debouncedSearchTerm,
    searchState.useRegex,
    searchState.matchCase,
  ]);

  // Memoize search config to prevent re-creating object on every render
  // This allows React.memo on HunkViewer to work properly
  const searchConfig = useMemo(
    () =>
      debouncedSearchTerm
        ? {
            searchTerm: debouncedSearchTerm,
            useRegex: searchState.useRegex,
            matchCase: searchState.matchCase,
          }
        : undefined,
    [debouncedSearchTerm, searchState.useRegex, searchState.matchCase]
  );

  // Handle toggling read state with auto-navigation
  const handleToggleRead = useCallback(
    (hunkId: string) => {
      const wasRead = isRead(hunkId);
      toggleRead(hunkId);

      // If toggling the selected hunk, check if it will still be visible after toggle
      if (hunkId === selectedHunkId) {
        // Hunk is visible if: showReadHunks is on OR it will be unread after toggle
        const willBeVisible = filters.showReadHunks || wasRead;

        if (!willBeVisible) {
          // Compute filtered hunks here to avoid dependency on filteredHunks array
          const currentFiltered = filters.showReadHunks
            ? hunks
            : hunks.filter((h) => !isRead(h.id));

          // Hunk will be filtered out - move to next visible hunk
          const currentIndex = currentFiltered.findIndex((h) => h.id === hunkId);
          if (currentIndex !== -1) {
            if (currentIndex < currentFiltered.length - 1) {
              setSelectedHunkId(currentFiltered[currentIndex + 1].id);
            } else if (currentIndex > 0) {
              setSelectedHunkId(currentFiltered[currentIndex - 1].id);
            } else {
              setSelectedHunkId(null);
            }
          }
        }
      }
    },
    [isRead, toggleRead, filters.showReadHunks, hunks, selectedHunkId]
  );

  // Stable callbacks for HunkViewer (single callback shared across all hunks)
  const handleHunkClick = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const hunkId = e.currentTarget.dataset.hunkId;
    if (hunkId) setSelectedHunkId(hunkId);
  }, []);

  const handleHunkToggleRead = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      const hunkId = e.currentTarget.dataset.hunkId;
      if (hunkId) handleToggleRead(hunkId);
    },
    [handleToggleRead]
  );

  const handleRegisterToggleExpand = useCallback((hunkId: string, toggleFn: () => void) => {
    toggleExpandFnsRef.current.set(hunkId, toggleFn);
  }, []);

  // Calculate stats
  const stats = useMemo(() => {
    const total = hunks.length;
    const read = hunks.filter((h) => isRead(h.id)).length;
    return {
      total,
      read,
      unread: total - read,
    };
  }, [hunks, isRead]);

  // Scroll selected hunk into view
  useEffect(() => {
    if (!selectedHunkId) return;

    // Find the hunk container element by data attribute
    const hunkElement = document.querySelector(`[data-hunk-id="${selectedHunkId}"]`);
    if (hunkElement) {
      hunkElement.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [selectedHunkId]);

  // Keyboard navigation (j/k or arrow keys) - only when panel is focused
  useEffect(() => {
    if (!isPanelFocused) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere with text input in chat or other editable elements
      if (e.target instanceof HTMLElement) {
        const tagName = e.target.tagName.toLowerCase();
        if (tagName === "input" || tagName === "textarea" || e.target.contentEditable === "true") {
          return;
        }
      }

      if (!selectedHunkId) return;

      const currentIndex = filteredHunks.findIndex((h) => h.id === selectedHunkId);
      if (currentIndex === -1) return;

      // Navigation
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        if (currentIndex < filteredHunks.length - 1) {
          setSelectedHunkId(filteredHunks[currentIndex + 1].id);
        }
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        if (currentIndex > 0) {
          setSelectedHunkId(filteredHunks[currentIndex - 1].id);
        }
      } else if (matchesKeybind(e, KEYBINDS.TOGGLE_HUNK_READ)) {
        // Toggle read state of selected hunk
        e.preventDefault();
        handleToggleRead(selectedHunkId);
      } else if (matchesKeybind(e, KEYBINDS.TOGGLE_HUNK_COLLAPSE)) {
        // Toggle expand/collapse state of selected hunk
        e.preventDefault();
        const toggleFn = toggleExpandFnsRef.current.get(selectedHunkId);
        if (toggleFn) {
          toggleFn();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPanelFocused, selectedHunkId, filteredHunks, handleToggleRead]);

  // Global keyboard shortcuts (Ctrl+R / Cmd+R for refresh, Ctrl+F / Cmd+F for search)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchesKeybind(e, KEYBINDS.REFRESH_REVIEW)) {
        e.preventDefault();
        setRefreshTrigger((prev) => prev + 1);
      } else if (matchesKeybind(e, KEYBINDS.FOCUS_REVIEW_SEARCH)) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div
      ref={panelRef}
      tabIndex={0}
      onFocus={() => setIsPanelFocused(true)}
      onBlur={() => setIsPanelFocused(false)}
      className="[container-type:inline-size] flex h-full min-h-0 flex-col bg-neutral-950 outline-none [container-name:review-panel] focus-within:shadow-[inset_0_0_0_1px_rgba(0,122,204,0.2)]"
    >
      {/* Always show controls so user can change diff base */}
      <ReviewControls
        filters={filters}
        stats={stats}
        onFiltersChange={setFilters}
        onRefresh={() => setRefreshTrigger((prev) => prev + 1)}
        isLoading={isLoadingHunks || isLoadingTree}
        workspaceId={workspaceId}
        workspacePath={workspacePath}
        refreshTrigger={refreshTrigger}
      />

      {error ? (
        <div className="text-danger-soft bg-danger-soft/10 border-danger-soft/30 font-monospace m-3 rounded border p-6 text-xs leading-[1.5] break-words whitespace-pre-wrap">
          {error}
        </div>
      ) : isLoadingHunks && hunks.length === 0 && !fileTree ? (
        <div className="flex h-full items-center justify-center text-sm text-neutral-400">
          Loading diff...
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-row overflow-hidden @[800px]:flex-col">
          <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            {truncationWarning && (
              <div className="bg-warning/10 border-warning/30 text-warning mx-3 my-3 flex items-center gap-1.5 rounded border px-3 py-1.5 text-[10px] leading-[1.3] before:text-xs before:content-['⚠️']">
                {truncationWarning}
              </div>
            )}

            <div className="border-b border-neutral-800 bg-neutral-900 px-3 py-2">
              <div className="hover:border-neutral-800-gray flex items-stretch overflow-hidden rounded border border-neutral-800 bg-neutral-950 transition-[border-color] duration-150 focus-within:border-sky-600 focus-within:hover:border-sky-600">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={`Search in files and hunks... (${formatKeybind(KEYBINDS.FOCUS_REVIEW_SEARCH)})`}
                  value={searchState.input}
                  onChange={(e) => setSearchState({ ...searchState, input: e.target.value })}
                  className="flex h-full flex-1 items-center border-none bg-transparent px-2.5 py-1.5 font-sans text-xs leading-[1.4] text-neutral-300 outline-none placeholder:text-neutral-400 focus:bg-neutral-900"
                />
                <TooltipWrapper inline>
                  <button
                    className={cn(
                      "py-1.5 px-2.5 border-none border-l border-neutral-800 text-[11px] font-monospace font-semibold leading-[1.4] cursor-pointer outline-none transition-all duration-150 whitespace-nowrap flex items-center h-full",
                      searchState.useRegex
                        ? "bg-review-bg-blue text-sky-600-light shadow-[inset_0_0_0_1px_rgba(77,184,255,0.4)] hover:bg-review-bg-info hover:text-sky-600-light"
                        : "bg-transparent text-neutral-400 hover:bg-neutral-900 hover:text-neutral-300",
                      "active:translate-y-px"
                    )}
                    onClick={() =>
                      setSearchState({ ...searchState, useRegex: !searchState.useRegex })
                    }
                  >
                    .*
                  </button>
                  <Tooltip position="bottom">
                    {searchState.useRegex ? "Using regex search" : "Using substring search"}
                  </Tooltip>
                </TooltipWrapper>
                <TooltipWrapper inline>
                  <button
                    className={cn(
                      "py-1.5 px-2.5 border-none border-l border-neutral-800 text-[11px] font-monospace font-semibold leading-[1.4] cursor-pointer outline-none transition-all duration-150 whitespace-nowrap flex items-center h-full",
                      searchState.matchCase
                        ? "bg-review-bg-blue text-sky-600-light shadow-[inset_0_0_0_1px_rgba(77,184,255,0.4)] hover:bg-review-bg-info hover:text-sky-600-light"
                        : "bg-transparent text-neutral-400 hover:bg-neutral-900 hover:text-neutral-300",
                      "active:translate-y-px"
                    )}
                    onClick={() =>
                      setSearchState({ ...searchState, matchCase: !searchState.matchCase })
                    }
                  >
                    Aa
                  </button>
                  <Tooltip position="bottom">
                    {searchState.matchCase
                      ? "Match case (case-sensitive)"
                      : "Ignore case (case-insensitive)"}
                  </Tooltip>
                </TooltipWrapper>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {hunks.length === 0 ? (
                <div className="flex flex-col items-center justify-start gap-3 px-6 pt-12 pb-6 text-center text-neutral-400">
                  <div className="text-base font-medium text-neutral-300">No changes found</div>
                  <div className="text-[13px] leading-[1.5]">
                    No changes found for the selected diff base.
                    <br />
                    Try selecting a different base or make some changes.
                  </div>
                  {diagnosticInfo && (
                    <details className="mt-4 w-full max-w-96 cursor-pointer rounded border border-neutral-800 bg-neutral-900 p-3 [&_summary]:flex [&_summary]:list-none [&_summary]:items-center [&_summary]:gap-1.5 [&_summary]:text-xs [&_summary]:font-medium [&_summary]:text-neutral-400 [&_summary]:select-none [&_summary::-webkit-details-marker]:hidden [&_summary::before]:text-[10px] [&_summary::before]:transition-transform [&_summary::before]:duration-200 [&_summary::before]:content-['▶'] [&[open]_summary::before]:rotate-90">
                      <summary>Show diagnostic info</summary>
                      <div className="font-monospace mt-3 text-[11px] leading-[1.6] text-neutral-300">
                        <div className="grid grid-cols-[140px_1fr] gap-3 py-1 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-neutral-800">
                          <div className="font-medium text-neutral-400">Command:</div>
                          <div className="break-all text-neutral-300 select-all">
                            {diagnosticInfo.command}
                          </div>
                        </div>
                        <div className="grid grid-cols-[140px_1fr] gap-3 py-1 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-neutral-800">
                          <div className="font-medium text-neutral-400">Output size:</div>
                          <div className="break-all text-neutral-300 select-all">
                            {diagnosticInfo.outputLength.toLocaleString()} bytes
                          </div>
                        </div>
                        <div className="grid grid-cols-[140px_1fr] gap-3 py-1 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-neutral-800">
                          <div className="font-medium text-neutral-400">Files parsed:</div>
                          <div className="break-all text-neutral-300 select-all">
                            {diagnosticInfo.fileDiffCount}
                          </div>
                        </div>
                        <div className="grid grid-cols-[140px_1fr] gap-3 py-1">
                          <div className="font-medium text-neutral-400">Hunks extracted:</div>
                          <div className="break-all text-neutral-300 select-all">
                            {diagnosticInfo.hunkCount}
                          </div>
                        </div>
                      </div>
                    </details>
                  )}
                </div>
              ) : filteredHunks.length === 0 ? (
                <div className="flex flex-col items-center justify-start gap-3 px-6 pt-12 pb-6 text-center text-neutral-400">
                  <div className="text-[13px] leading-[1.5]">
                    {debouncedSearchTerm.trim()
                      ? `No hunks match "${debouncedSearchTerm}". Try a different search term.`
                      : selectedFilePath
                        ? `No hunks in ${selectedFilePath}. Try selecting a different file.`
                        : "No hunks match the current filters. Try adjusting your filter settings."}
                  </div>
                </div>
              ) : (
                filteredHunks.map((hunk) => {
                  const isSelected = hunk.id === selectedHunkId;
                  const hunkIsRead = isRead(hunk.id);

                  return (
                    <HunkViewer
                      key={hunk.id}
                      hunk={hunk}
                      hunkId={hunk.id}
                      workspaceId={workspaceId}
                      isSelected={isSelected}
                      isRead={hunkIsRead}
                      onClick={handleHunkClick}
                      onToggleRead={handleHunkToggleRead}
                      onRegisterToggleExpand={handleRegisterToggleExpand}
                      onReviewNote={onReviewNote}
                      searchConfig={searchConfig}
                    />
                  );
                })
              )}
            </div>
          </div>

          {/* FileTree positioning handled by CSS order property */}
          {(fileTree ?? isLoadingTree) && (
            <div className="order-2 flex min-h-0 w-80 shrink-0 flex-col overflow-hidden border-l border-neutral-800 @[800px]:order-0 @[800px]:h-auto @[800px]:w-full @[800px]:flex-[0_0_auto] @[800px]:border-b @[800px]:border-l-0 @[800px]:border-neutral-800">
              <FileTree
                root={fileTree}
                selectedPath={selectedFilePath}
                onSelectFile={setSelectedFilePath}
                isLoading={isLoadingTree}
                getFileReadStatus={getFileReadStatus}
                workspaceId={workspaceId}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
