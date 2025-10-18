/**
 * ReviewPanel - Main code review interface
 * Displays diff hunks and allows user to accept/reject with notes
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import styled from "@emotion/styled";
import { HunkViewer } from "./HunkViewer";
import { ReviewActions } from "./ReviewActions";
import { ReviewControls } from "./ReviewControls";
import { FileTree } from "./FileTree";
import { useReviewState } from "@/hooks/useReviewState";
import { usePersistedState } from "@/hooks/usePersistedState";
import { parseDiff, extractAllHunks } from "@/utils/git/diffParser";
import { parseNumstat, buildFileTree, extractNewPath } from "@/utils/git/numstatParser";
import type { DiffHunk, ReviewFilters as ReviewFiltersType } from "@/types/review";
import type { FileTreeNode } from "@/utils/git/numstatParser";

interface ReviewPanelProps {
  workspaceId: string;
  workspacePath: string;
}

const PanelContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #1e1e1e;
`;

const ContentContainer = styled.div`
  display: flex;
  flex-direction: row; /* Default: side-by-side layout */
  flex: 1;
  min-height: 0;
  overflow: hidden;
  container-type: inline-size; /* Enable container queries */
  
  /* Stack vertically when container is narrow (uses container query) */
  @container (max-width: 800px) {
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
  
  /* On narrow containers, ensure it can scroll */
  @container (max-width: 800px) {
    flex: 1; /* Take remaining space after file tree */
    min-height: 0; /* Critical for flex child scrolling */
  }
`;

const HunkList = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
`;

const FileTreeSection = styled.div`
  width: 300px;
  flex-shrink: 0;
  border-left: 1px solid #3e3e42;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  
  /* On narrow containers, stack above hunks with limited height */
  @container (max-width: 800px) {
    width: 100%;
    border-left: none;
    border-bottom: 1px solid #3e3e42;
    height: 250px; /* Fixed height on narrow containers */
    flex: 0 0 250px; /* Don't grow, don't shrink, explicit size */
    order: -1; /* Move to top */
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

const StaleReviewsBanner = styled.div`
  background: rgba(244, 135, 113, 0.1);
  border-bottom: 1px solid rgba(244, 135, 113, 0.3);
  padding: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #f48771;
`;

const TruncationBanner = styled.div`
  background: rgba(255, 193, 7, 0.1);
  border: 1px solid rgba(255, 193, 7, 0.3);
  border-radius: 4px;
  padding: 8px 12px;
  margin: 12px;
  color: #ffc107;
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 8px;
  line-height: 1.5;
  
  &::before {
    content: "⚠️";
    font-size: 14px;
  }
`;

const CleanupButton = styled.button`
  padding: 4px 12px;
  background: rgba(244, 135, 113, 0.2);
  color: #f48771;
  border: 1px solid #f48771;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: var(--font-primary);

  &:hover {
    background: rgba(244, 135, 113, 0.3);
  }
`;

interface DiagnosticInfo {
  command: string;
  outputLength: number;
  fileDiffCount: number;
  hunkCount: number;
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({ workspaceId, workspacePath }) => {
  const [hunks, setHunks] = useState<DiffHunk[]>([]);
  const [selectedHunkId, setSelectedHunkId] = useState<string | null>(null);
  const [isLoadingHunks, setIsLoadingHunks] = useState(true);
  const [isLoadingTree, setIsLoadingTree] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diagnosticInfo, setDiagnosticInfo] = useState<DiagnosticInfo | null>(null);
  const [truncationWarning, setTruncationWarning] = useState<string | null>(null);
  const [fileTree, setFileTree] = useState<FileTreeNode | null>(null);
  
  // Persist file filter per workspace
  const [selectedFilePath, setSelectedFilePath] = usePersistedState<string | null>(
    `review-file-filter:${workspaceId}`,
    null
  );
  
  // Persist diff base per workspace
  const [diffBase, setDiffBase] = usePersistedState(
    `review-diff-base:${workspaceId}`,
    "HEAD"
  );
  
  const [filters, setFilters] = useState<ReviewFiltersType>({
    showReviewed: false,
    statusFilter: "unreviewed",
    diffBase: diffBase,
  });

  const {
    getReview,
    setReview,
    deleteReview,
    calculateStats,
    hasStaleReviews,
    removeStaleReviews,
  } = useReviewState(workspaceId);

  // Load file tree - only when workspace or diffBase changes (not when path filter changes)
  useEffect(() => {
    let cancelled = false;

    const loadFileTree = async () => {
      setIsLoadingTree(true);
      try {
        // Build numstat command for file tree
        let numstatCommand: string;
        
        if (filters.diffBase === "--staged") {
          numstatCommand = "git diff --staged --numstat";
        } else if (filters.diffBase === "HEAD") {
          numstatCommand = "git diff HEAD --numstat";
        } else {
          numstatCommand = `git diff ${filters.diffBase}...HEAD --numstat`;
        }

        const numstatResult = await window.api.workspace.executeBash(
          workspaceId,
          numstatCommand,
          { timeout_secs: 30 }
        );

        if (cancelled) return;

        if (numstatResult.success) {
          const numstatOutput = numstatResult.data.output ?? "";
          const fileStats = parseNumstat(numstatOutput);
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
  }, [workspaceId, workspacePath, filters.diffBase]);

  // Load diff hunks - when workspace, diffBase, or selected path changes
  useEffect(() => {
    let cancelled = false;

    const loadDiff = async () => {
      setIsLoadingHunks(true);
      setError(null);
      setTruncationWarning(null);
      try {
        // Build git diff command based on selected base
        let diffCommand: string;
        
        // Add path filter if a file/folder is selected
        // Extract new path from rename syntax (e.g., "{old => new}" -> "new")
        const pathFilter = selectedFilePath ? ` -- "${extractNewPath(selectedFilePath)}"` : "";
        
        if (filters.diffBase === "--staged") {
          diffCommand = `git diff --staged${pathFilter}`;
        } else if (filters.diffBase === "HEAD") {
          diffCommand = `git diff HEAD${pathFilter}`;
        } else {
          // Use three-dot syntax to show changes since common ancestor
          diffCommand = `git diff ${filters.diffBase}...HEAD${pathFilter}`;
        }

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
            `Truncated (${truncationInfo.reason}): showing ${allHunks.length} hunks. Use file tree to filter.`
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
  }, [workspaceId, workspacePath, filters.diffBase, selectedFilePath]); // Now includes selectedFilePath
  
  // Persist diffBase when it changes
  useEffect(() => {
    setDiffBase(filters.diffBase);
  }, [filters.diffBase, setDiffBase]);

  // Calculate stats
  const stats = useMemo(() => calculateStats(hunks), [hunks, calculateStats]);

  // Check for stale reviews
  const hasStale = useMemo(
    () => hasStaleReviews(hunks.map((h) => h.id)),
    [hunks, hasStaleReviews]
  );

  // Filter hunks based on review status only (path filtering done server-side via git diff)
  const filteredHunks = useMemo(() => {
    return hunks.filter((hunk) => {
      const review = getReview(hunk.id);

      // Filter by review status
      if (!filters.showReviewed && review) {
        return false;
      }

      // Filter by status filter
      if (filters.statusFilter !== "all") {
        if (filters.statusFilter === "unreviewed" && review) {
          return false;
        }
        if (filters.statusFilter === "accepted" && review?.status !== "accepted") {
          return false;
        }
        if (filters.statusFilter === "rejected" && review?.status !== "rejected") {
          return false;
        }
      }

      return true;
    });
  }, [hunks, filters, getReview]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!selectedHunkId) return;

      const currentIndex = filteredHunks.findIndex((h) => h.id === selectedHunkId);
      if (currentIndex === -1) return;

      const review = getReview(selectedHunkId);

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
      }
      // Actions
      else if (e.key === "a" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setReview(selectedHunkId, "accepted", review?.note);
      } else if (e.key === "r" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setReview(selectedHunkId, "rejected", review?.note);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedHunkId, filteredHunks, getReview, setReview]);

  const handleCleanupStaleReviews = useCallback(() => {
    removeStaleReviews(hunks.map((h) => h.id));
  }, [hunks, removeStaleReviews]);

  return (
    <PanelContainer>
      {/* Always show controls so user can change diff base */}
      <ReviewControls filters={filters} stats={stats} onFiltersChange={setFilters} />

      {error ? (
        <ErrorState>{error}</ErrorState>
      ) : isLoadingHunks && hunks.length === 0 && !fileTree ? (
        <LoadingState>Loading diff...</LoadingState>
      ) : (
        <ContentContainer>
          <HunksSection>
            {truncationWarning && (
              <TruncationBanner>{truncationWarning}</TruncationBanner>
            )}
            
            {hasStale && (
              <StaleReviewsBanner>
                <span>Some reviews reference hunks that no longer exist</span>
                <CleanupButton onClick={handleCleanupStaleReviews}>Clean up</CleanupButton>
              </StaleReviewsBanner>
            )}

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
                  const review = getReview(hunk.id);
                  const isSelected = hunk.id === selectedHunkId;

                  return (
                    <HunkViewer
                      key={hunk.id}
                      hunk={hunk}
                      review={review}
                      isSelected={isSelected}
                      onClick={() => setSelectedHunkId(hunk.id)}
                    >
                      {isSelected && (
                        <ReviewActions
                          currentStatus={review?.status}
                          currentNote={review?.note}
                          onAccept={(note) => setReview(hunk.id, "accepted", note)}
                          onReject={(note) => setReview(hunk.id, "rejected", note)}
                          onDelete={() => deleteReview(hunk.id)}
                        />
                      )}
                    </HunkViewer>
                  );
                })
              )}
            </HunkList>
          </HunksSection>

          {(fileTree ?? isLoadingTree) && (
            <FileTreeSection>
              <FileTree
                root={fileTree}
                selectedPath={selectedFilePath}
                onSelectFile={setSelectedFilePath}
                isLoading={isLoadingTree}
              />
            </FileTreeSection>
          )}
        </ContentContainer>
      )}
    </PanelContainer>
  );
};

