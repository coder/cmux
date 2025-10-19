/**
 * ReviewPanel - Main code review interface
 * Displays diff hunks for viewing changes in the workspace
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import styled from "@emotion/styled";
import { HunkViewer } from "./HunkViewer";
import { ReviewControls } from "./ReviewControls";
import { FileTree } from "./FileTree";
import { usePersistedState } from "@/hooks/usePersistedState";
import { useReviewState } from "@/hooks/useReviewState";
import { parseDiff, extractAllHunks } from "@/utils/git/diffParser";
import {
  parseNumstat,
  buildFileTree,
  extractNewPath,
  extractCommonPrefix,
} from "@/utils/git/numstatParser";
import type { DiffHunk, ReviewFilters as ReviewFiltersType } from "@/types/review";
import type { FileTreeNode } from "@/utils/git/numstatParser";
import { matchesKeybind, KEYBINDS } from "@/utils/ui/keybinds";

interface ReviewPanelProps {
  workspaceId: string;
  workspacePath: string;
  onReviewNote?: (note: string) => void;
}

const PanelContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #1e1e1e;

  /* Enable container queries for responsive layout */
  container-type: inline-size;
  container-name: review-panel;

  /* Make focusable for keyboard navigation */
  outline: none;

  &:focus-within {
    /* Subtle indicator when panel has focus */
    box-shadow: inset 0 0 0 1px rgba(0, 122, 204, 0.2);
  }
`;

const ContentContainer = styled.div`
  display: flex;
  flex-direction: row; /* Default: wide layout */
  flex: 1;
  min-height: 0;
  overflow: hidden;

  /* Switch to vertical layout when container is narrow */
  @container review-panel (max-width: 800px) {
    flex-direction: column;
  }
`;

const HunksSection = styled.div`
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  order: 1; /* Stay in middle regardless of layout */
`;

const HunkList = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
`;

const FileTreeSection = styled.div`
  /* Default: Wide layout - fixed width on right side */
  width: 300px;
  flex-shrink: 0;
  border-left: 1px solid #3e3e42;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  order: 2; /* Come after HunksSection in wide mode */

  /* Narrow layout: full width, grow to fit full tree, above hunks */
  @container review-panel (max-width: 800px) {
    width: 100%;
    height: auto; /* Let it grow to show full tree */
    flex: 0 0 auto; /* Fixed size based on content */
    border-left: none;
    border-bottom: 1px solid #3e3e42;
    order: 0; /* Come before HunksSection in narrow mode */
  }
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start; /* Changed from center to start */
  padding: 48px 24px 24px 24px; /* More padding on top */
  color: #888;
  text-align: center;
  gap: 12px;
`;

const EmptyStateTitle = styled.div`
  font-size: 16px;
  font-weight: 500;
  color: #ccc;
`;

const EmptyStateText = styled.div`
  font-size: 13px;
  line-height: 1.5;
`;

const DiagnosticSection = styled.details`
  margin-top: 16px;
  max-width: 500px;
  width: 100%;
  background: #2d2d2d;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  padding: 12px;
  cursor: pointer;

  summary {
    color: #888;
    font-size: 12px;
    font-weight: 500;
    user-select: none;
    list-style: none;
    display: flex;
    align-items: center;
    gap: 6px;

    &::-webkit-details-marker {
      display: none;
    }

    &::before {
      content: "▶";
      font-size: 10px;
      transition: transform 0.2s ease;
    }
  }

  &[open] summary::before {
    transform: rotate(90deg);
  }
`;

const DiagnosticContent = styled.div`
  margin-top: 12px;
  font-family: var(--font-monospace);
  font-size: 11px;
  color: #ccc;
  line-height: 1.6;
`;

const DiagnosticRow = styled.div`
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 12px;
  padding: 4px 0;

  &:not(:last-child) {
    border-bottom: 1px solid #3e3e42;
  }
`;

const DiagnosticLabel = styled.div`
  color: #888;
  font-weight: 500;
`;

const DiagnosticValue = styled.div`
  color: #ccc;
  word-break: break-all;
  user-select: all;
`;

const LoadingState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #888;
  font-size: 14px;
`;

const ErrorState = styled.div`
  padding: 24px;
  color: #f48771;
  background: rgba(244, 135, 113, 0.1);
  border: 1px solid rgba(244, 135, 113, 0.3);
  border-radius: 4px;
  margin: 12px;
  font-family: var(--font-monospace);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
`;

const TruncationBanner = styled.div`
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid rgba(255, 193, 7, 0.3);
  border-radius: 4px;
  padding: 6px 12px;
  margin: 12px;
  color: #ffc107;
  font-size: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.3;

  &::before {
    content: "⚠️";
    font-size: 12px;
  }
`;

interface DiagnosticInfo {
  command: string;
  outputLength: number;
  fileDiffCount: number;
  hunkCount: number;
}

/**
 * Build git diff command based on diffBase and includeDirty flag
 * Shared logic between numstat (file tree) and diff (hunks) commands
 */
function buildGitDiffCommand(
  diffBase: string,
  includeDirty: boolean,
  pathFilter: string,
  command: "diff" | "numstat"
): string {
  const isNumstat = command === "numstat";
  const flag = isNumstat ? " -M --numstat" : " -M";

  let cmd: string;

  if (diffBase === "--staged") {
    cmd = `git diff --staged${flag}${pathFilter}`;
  } else if (diffBase === "HEAD") {
    cmd = `git diff HEAD${flag}${pathFilter}`;
  } else {
    cmd = `git diff ${diffBase}...HEAD${flag}${pathFilter}`;
  }

  // Append dirty changes if requested
  if (includeDirty) {
    cmd += ` && git diff HEAD${flag}${pathFilter}`;
  }

  return cmd;
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({
  workspaceId,
  workspacePath,
  onReviewNote,
}) => {
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
  const [commonPrefix, setCommonPrefix] = useState<string | null>(null);

  // Persist file filter per workspace
  const [selectedFilePath, setSelectedFilePath] = usePersistedState<string | null>(
    `review-file-filter:${workspaceId}`,
    null
  );

  // Global default base (shared across all workspaces)
  const [defaultBase] = usePersistedState<string>("review-default-base", "HEAD");

  // Persist diff base per workspace (falls back to global default)
  const [diffBase, setDiffBase] = usePersistedState(`review-diff-base:${workspaceId}`, defaultBase);

  // Persist includeDirty flag per workspace
  const [includeDirty, setIncludeDirty] = usePersistedState(
    `review-include-dirty:${workspaceId}`,
    false
  );

  // Persist showReadHunks flag per workspace
  const [showReadHunks, setShowReadHunks] = usePersistedState(
    `review-show-read:${workspaceId}`,
    true
  );

  // Initialize review state hook
  const reviewState = useReviewState(workspaceId);

  const [filters, setFilters] = useState<ReviewFiltersType>({
    showReadHunks: showReadHunks,
    diffBase: diffBase,
    includeDirty: includeDirty,
  });

  // Load file tree - when workspace, diffBase, or refreshTrigger changes
  useEffect(() => {
    let cancelled = false;

    const loadFileTree = async () => {
      setIsLoadingTree(true);
      try {
        const numstatCommand = buildGitDiffCommand(
          filters.diffBase,
          filters.includeDirty,
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

          // Extract common prefix for display (don't modify paths)
          const prefix = extractCommonPrefix(fileStats);

          // Build tree with original paths (needed for git commands)
          const tree = buildFileTree(fileStats);
          setFileTree(tree);
          setCommonPrefix(prefix);
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
  }, [workspaceId, workspacePath, filters.diffBase, filters.includeDirty, refreshTrigger]);

  // Load diff hunks - when workspace, diffBase, selected path, or refreshTrigger changes
  useEffect(() => {
    let cancelled = false;

    const loadDiff = async () => {
      setIsLoadingHunks(true);
      setError(null);
      setTruncationWarning(null);
      try {
        // Add path filter if a file/folder is selected
        // Extract new path from rename syntax (e.g., "{old => new}" -> "new")
        const pathFilter = selectedFilePath ? ` -- "${extractNewPath(selectedFilePath)}"` : "";

        const diffCommand = buildGitDiffCommand(
          filters.diffBase,
          filters.includeDirty,
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
  }, [
    workspaceId,
    workspacePath,
    filters.diffBase,
    filters.includeDirty,
    selectedFilePath,
    refreshTrigger,
  ]);

  // Persist diffBase when it changes
  useEffect(() => {
    setDiffBase(filters.diffBase);
  }, [filters.diffBase, setDiffBase]);

  // Persist includeDirty when it changes
  useEffect(() => {
    setIncludeDirty(filters.includeDirty);
  }, [filters.includeDirty, setIncludeDirty]);

  // Persist showReadHunks when it changes
  useEffect(() => {
    setShowReadHunks(filters.showReadHunks);
  }, [filters.showReadHunks, setShowReadHunks]);

  // Get read status for a file
  const getFileReadStatus = useCallback(
    (filePath: string) => {
      const fileHunks = hunks.filter((h) => h.filePath === filePath);
      const total = fileHunks.length;
      const read = fileHunks.filter((h) => reviewState.isRead(h.id)).length;
      return { total, read };
    },
    [hunks, reviewState]
  );

  // Filter hunks based on read state
  const filteredHunks = useMemo(() => {
    if (filters.showReadHunks) {
      return hunks;
    }
    return hunks.filter((hunk) => !reviewState.isRead(hunk.id));
  }, [hunks, filters.showReadHunks, reviewState]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = hunks.length;
    const read = hunks.filter((h) => reviewState.isRead(h.id)).length;
    return {
      total,
      read,
      unread: total - read,
    };
  }, [hunks, reviewState]);

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
        reviewState.toggleRead(selectedHunkId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPanelFocused, selectedHunkId, filteredHunks, reviewState]);

  // Global keyboard shortcut for refresh (Ctrl+R / Cmd+R)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchesKeybind(e, KEYBINDS.REFRESH_REVIEW)) {
        e.preventDefault();
        setRefreshTrigger((prev) => prev + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <PanelContainer
      tabIndex={0}
      onFocus={() => setIsPanelFocused(true)}
      onBlur={() => setIsPanelFocused(false)}
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
        <ErrorState>{error}</ErrorState>
      ) : isLoadingHunks && hunks.length === 0 && !fileTree ? (
        <LoadingState>Loading diff...</LoadingState>
      ) : (
        <ContentContainer>
          <HunksSection>
            {truncationWarning && <TruncationBanner>{truncationWarning}</TruncationBanner>}

            <HunkList>
              {hunks.length === 0 ? (
                <EmptyState>
                  <EmptyStateTitle>No changes found</EmptyStateTitle>
                  <EmptyStateText>
                    No changes found for the selected diff base.
                    <br />
                    Try selecting a different base or make some changes.
                  </EmptyStateText>
                  {diagnosticInfo && (
                    <DiagnosticSection>
                      <summary>Show diagnostic info</summary>
                      <DiagnosticContent>
                        <DiagnosticRow>
                          <DiagnosticLabel>Command:</DiagnosticLabel>
                          <DiagnosticValue>{diagnosticInfo.command}</DiagnosticValue>
                        </DiagnosticRow>
                        <DiagnosticRow>
                          <DiagnosticLabel>Output size:</DiagnosticLabel>
                          <DiagnosticValue>
                            {diagnosticInfo.outputLength.toLocaleString()} bytes
                          </DiagnosticValue>
                        </DiagnosticRow>
                        <DiagnosticRow>
                          <DiagnosticLabel>Files parsed:</DiagnosticLabel>
                          <DiagnosticValue>{diagnosticInfo.fileDiffCount}</DiagnosticValue>
                        </DiagnosticRow>
                        <DiagnosticRow>
                          <DiagnosticLabel>Hunks extracted:</DiagnosticLabel>
                          <DiagnosticValue>{diagnosticInfo.hunkCount}</DiagnosticValue>
                        </DiagnosticRow>
                      </DiagnosticContent>
                    </DiagnosticSection>
                  )}
                </EmptyState>
              ) : filteredHunks.length === 0 ? (
                <EmptyState>
                  <EmptyStateText>
                    {selectedFilePath
                      ? `No hunks in ${selectedFilePath}. Try selecting a different file.`
                      : "No hunks match the current filters. Try adjusting your filter settings."}
                  </EmptyStateText>
                </EmptyState>
              ) : (
                filteredHunks.map((hunk) => {
                  const isSelected = hunk.id === selectedHunkId;
                  const isRead = reviewState.isRead(hunk.id);

                  return (
                    <HunkViewer
                      key={hunk.id}
                      hunk={hunk}
                      isSelected={isSelected}
                      isRead={isRead}
                      onClick={() => setSelectedHunkId(hunk.id)}
                      onToggleRead={() => reviewState.toggleRead(hunk.id)}
                      onReviewNote={onReviewNote}
                    />
                  );
                })
              )}
            </HunkList>
          </HunksSection>

          {/* FileTree positioning handled by CSS order property */}
          {(fileTree ?? isLoadingTree) && (
            <FileTreeSection>
              <FileTree
                root={fileTree}
                selectedPath={selectedFilePath}
                onSelectFile={setSelectedFilePath}
                isLoading={isLoadingTree}
                commonPrefix={commonPrefix}
                getFileReadStatus={getFileReadStatus}
              />
            </FileTreeSection>
          )}
        </ContentContainer>
      )}
    </PanelContainer>
  );
};
