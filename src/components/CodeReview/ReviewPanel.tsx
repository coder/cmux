/**
 * ReviewPanel - Main code review interface
 * Displays diff hunks and allows user to accept/reject with notes
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import styled from "@emotion/styled";
import { HunkViewer } from "./HunkViewer";
import { ReviewActions } from "./ReviewActions";
import { ReviewFilters } from "./ReviewFilters";
import { useReviewState } from "@/hooks/useReviewState";
import { parseDiff, extractAllHunks } from "@/utils/git/diffParser";
import type { DiffHunk, ReviewFilters as ReviewFiltersType } from "@/types/review";

interface ReviewPanelProps {
  workspaceId: string;
  workspacePath: string;
}

const PanelContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e1e;
`;

const HunkList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 12px;
`;

const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #888;
  text-align: center;
  padding: 24px;
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

const LoadingState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #888;
  font-size: 14px;
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

export const ReviewPanel: React.FC<ReviewPanelProps> = ({ workspaceId, workspacePath }) => {
  const [hunks, setHunks] = useState<DiffHunk[]>([]);
  const [selectedHunkId, setSelectedHunkId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filters, setFilters] = useState<ReviewFiltersType>({
    showReviewed: false,
    statusFilter: "unreviewed",
    diffBase: "HEAD",
  });

  const {
    getReview,
    setReview,
    deleteReview,
    calculateStats,
    hasStaleReviews,
    removeStaleReviews,
  } = useReviewState(workspaceId);

  // Load diff on mount and when workspace changes
  useEffect(() => {
    let cancelled = false;

    const loadDiff = async () => {
      setIsLoading(true);
      try {
        // Build git diff command based on selected base
        let diffCommand: string;
        if (filters.diffBase === "--staged") {
          // Show only staged changes
          diffCommand = "git diff --staged";
        } else if (filters.diffBase === "HEAD") {
          // Show uncommitted changes (working directory vs HEAD)
          diffCommand = "git diff HEAD";
        } else {
          // Compare current branch to another ref (e.g., main, origin/main)
          // Use three-dot syntax to show changes since common ancestor
          diffCommand = `git diff ${filters.diffBase}...HEAD`;
        }

        // Use executeBash to run git diff in the workspace
        const result = await window.api.workspace.executeBash(workspaceId, diffCommand);

        if (cancelled) return;

        if (!result.success) {
          console.error("Failed to get diff:", result.error);
          setHunks([]);
          return;
        }

        const diffOutput = result.data.output ?? "";
        const fileDiffs = parseDiff(diffOutput);
        const allHunks = extractAllHunks(fileDiffs);
        setHunks(allHunks);

        // Auto-select first hunk if none selected
        if (allHunks.length > 0 && !selectedHunkId) {
          setSelectedHunkId(allHunks[0].id);
        }
      } catch (error) {
        console.error("Failed to load diff:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadDiff();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, workspacePath, selectedHunkId, filters.diffBase]);

  // Calculate stats
  const stats = useMemo(() => calculateStats(hunks), [hunks, calculateStats]);

  // Check for stale reviews
  const hasStale = useMemo(
    () => hasStaleReviews(hunks.map((h) => h.id)),
    [hunks, hasStaleReviews]
  );

  // Filter hunks based on current filters
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
      {/* Always show filters so user can change diff base */}
      <ReviewFilters filters={filters} stats={stats} onFiltersChange={setFilters} />

      {isLoading ? (
        <LoadingState>Loading diff...</LoadingState>
      ) : hunks.length === 0 ? (
        <EmptyState>
          <EmptyStateTitle>No changes found</EmptyStateTitle>
          <EmptyStateText>
            No changes found for the selected diff base.
            <br />
            Try selecting a different base or make some changes.
          </EmptyStateText>
        </EmptyState>
      ) : (
        <>
          {hasStale && (
            <StaleReviewsBanner>
              <span>Some reviews reference hunks that no longer exist</span>
              <CleanupButton onClick={handleCleanupStaleReviews}>Clean up</CleanupButton>
            </StaleReviewsBanner>
          )}

          <HunkList>
            {filteredHunks.length === 0 ? (
              <EmptyState>
                <EmptyStateText>
                  No hunks match the current filters.
                  <br />
                  Try adjusting your filter settings.
                </EmptyStateText>
              </EmptyState>
            ) : (
              filteredHunks.map((hunk) => {
                const review = getReview(hunk.id);
                const isSelected = hunk.id === selectedHunkId;

                return (
                  <div key={hunk.id}>
                    <HunkViewer
                      hunk={hunk}
                      review={review}
                      isSelected={isSelected}
                      onClick={() => setSelectedHunkId(hunk.id)}
                    />
                    {isSelected && (
                      <ReviewActions
                        currentStatus={review?.status}
                        currentNote={review?.note}
                        onAccept={(note) => setReview(hunk.id, "accepted", note)}
                        onReject={(note) => setReview(hunk.id, "rejected", note)}
                        onDelete={() => deleteReview(hunk.id)}
                      />
                    )}
                  </div>
                );
              })
            )}
          </HunkList>
        </>
      )}
    </PanelContainer>
  );
};

