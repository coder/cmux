/**
 * Hook for managing code review state
 * Provides interface for reading/updating hunk reviews with localStorage persistence
 */

import { useCallback, useMemo } from "react";
import { usePersistedState } from "./usePersistedState";
import type { ReviewState, HunkReview, ReviewStats, DiffHunk } from "@/types/review";

/**
 * Get the localStorage key for review state
 */
function getReviewStateKey(workspaceId: string): string {
  return `code-review:${workspaceId}`;
}

/**
 * Hook for managing code review state for a workspace
 * Persists reviews to localStorage and provides helpers for common operations
 */
export function useReviewState(workspaceId: string) {
  const [reviewState, setReviewState] = usePersistedState<ReviewState>(
    getReviewStateKey(workspaceId),
    {
      workspaceId,
      reviews: {},
      lastUpdated: Date.now(),
    }
  );

  /**
   * Get review for a specific hunk
   */
  const getReview = useCallback(
    (hunkId: string): HunkReview | undefined => {
      return reviewState.reviews[hunkId];
    },
    [reviewState.reviews]
  );

  /**
   * Set or update a review for a hunk
   */
  const setReview = useCallback(
    (hunkId: string, status: "accepted" | "rejected", note?: string) => {
      setReviewState((prev) => ({
        ...prev,
        reviews: {
          ...prev.reviews,
          [hunkId]: {
            hunkId,
            status,
            note,
            timestamp: Date.now(),
          },
        },
        lastUpdated: Date.now(),
      }));
    },
    [setReviewState]
  );

  /**
   * Delete a review for a hunk
   */
  const deleteReview = useCallback(
    (hunkId: string) => {
      setReviewState((prev) => {
        const { [hunkId]: _, ...rest } = prev.reviews;
        return {
          ...prev,
          reviews: rest,
          lastUpdated: Date.now(),
        };
      });
    },
    [setReviewState]
  );

  /**
   * Clear all reviews
   */
  const clearAllReviews = useCallback(() => {
    setReviewState((prev) => ({
      ...prev,
      reviews: {},
      lastUpdated: Date.now(),
    }));
  }, [setReviewState]);

  /**
   * Remove stale reviews (hunks that no longer exist in the diff)
   */
  const removeStaleReviews = useCallback(
    (currentHunkIds: string[]) => {
      const currentIdSet = new Set(currentHunkIds);
      setReviewState((prev) => {
        const cleanedReviews: Record<string, HunkReview> = {};
        let changed = false;

        for (const [hunkId, review] of Object.entries(prev.reviews)) {
          if (currentIdSet.has(hunkId)) {
            cleanedReviews[hunkId] = review;
          } else {
            changed = true;
          }
        }

        if (!changed) return prev;

        return {
          ...prev,
          reviews: cleanedReviews,
          lastUpdated: Date.now(),
        };
      });
    },
    [setReviewState]
  );

  /**
   * Calculate review statistics
   */
  const stats = useMemo((): ReviewStats => {
    const reviews = Object.values(reviewState.reviews);
    return {
      total: reviews.length,
      accepted: reviews.filter((r) => r.status === "accepted").length,
      rejected: reviews.filter((r) => r.status === "rejected").length,
      unreviewed: 0, // Will be calculated by consumer based on total hunks
    };
  }, [reviewState.reviews]);

  /**
   * Check if there are any stale reviews (reviews for hunks not in current set)
   */
  const hasStaleReviews = useCallback(
    (currentHunkIds: string[]): boolean => {
      const currentIdSet = new Set(currentHunkIds);
      return Object.keys(reviewState.reviews).some((hunkId) => !currentIdSet.has(hunkId));
    },
    [reviewState.reviews]
  );

  /**
   * Calculate stats for a specific set of hunks
   */
  const calculateStats = useCallback(
    (hunks: DiffHunk[]): ReviewStats => {
      const total = hunks.length;
      let accepted = 0;
      let rejected = 0;

      for (const hunk of hunks) {
        const review = reviewState.reviews[hunk.id];
        if (review) {
          if (review.status === "accepted") accepted++;
          else if (review.status === "rejected") rejected++;
        }
      }

      return {
        total,
        accepted,
        rejected,
        unreviewed: total - accepted - rejected,
      };
    },
    [reviewState.reviews]
  );

  return {
    reviewState,
    getReview,
    setReview,
    deleteReview,
    clearAllReviews,
    removeStaleReviews,
    hasStaleReviews,
    stats,
    calculateStats,
  };
}
