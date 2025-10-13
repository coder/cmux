/**
 * Generic hook for caching data with a time-to-live (TTL).
 * Provides get, set, and invalidate operations for cached data.
 */

import { useRef, useCallback } from "react";
import { strict as assert } from "node:assert";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface TimedCache<T> {
  /**
   * Retrieves cached data if it exists and is not expired.
   * Returns null if cache is empty or expired.
   */
  get: () => T | null;

  /**
   * Stores data in the cache with the current timestamp.
   */
  set: (data: T) => void;

  /**
   * Invalidates the cache, clearing any stored data.
   */
  invalidate: () => void;
}

/**
 * Hook for managing cached data with automatic expiration.
 *
 * @param ttlMs - Time-to-live in milliseconds. Data older than this is considered expired.
 * @returns Cache interface with get, set, and invalidate methods
 *
 * @example
 * ```typescript
 * const cache = useTimedCache<MyData>(5000); // 5 second TTL
 *
 * const cached = cache.get();
 * if (cached) {
 *   return cached; // Use cached data
 * }
 *
 * const fresh = await fetchData();
 * cache.set(fresh); // Store for next time
 * ```
 */
export function useTimedCache<T>(ttlMs: number): TimedCache<T> {
  assert(
    typeof ttlMs === "number" && ttlMs > 0 && !isNaN(ttlMs) && isFinite(ttlMs),
    "useTimedCache expects ttlMs to be a positive, finite number"
  );

  const cacheRef = useRef<CacheEntry<T> | null>(null);

  const get = useCallback((): T | null => {
    if (!cacheRef.current) {
      return null;
    }

    const now = Date.now();
    assert(
      !isNaN(cacheRef.current.timestamp) && cacheRef.current.timestamp > 0,
      "Cached timestamp is invalid"
    );

    if (now - cacheRef.current.timestamp >= ttlMs) {
      // Cache expired
      cacheRef.current = null;
      return null;
    }

    return cacheRef.current.data;
  }, [ttlMs]);

  const set = useCallback((data: T) => {
    assert(data !== undefined, "useTimedCache.set() expects data to be defined");

    cacheRef.current = {
      data,
      timestamp: Date.now(),
    };
  }, []);

  const invalidate = useCallback(() => {
    cacheRef.current = null;
  }, []);

  return { get, set, invalidate };
}
