/**
 * Centralized cache management to prevent bugs from manual invalidation.
 * 
 * PROBLEM: With manual cache invalidation, adding a new cached getter requires
 * remembering to update invalidateCache(). Easy to forget = bugs.
 * 
 * SOLUTION: All caches managed centrally. Single invalidateAll() call clears
 * everything. Impossible to forget to invalidate a cache.
 * 
 * Usage:
 * ```typescript
 * private cache = new CacheManager();
 * 
 * getDisplayedMessages(): DisplayedMessage[] {
 *   return this.cache.get('displayedMessages', () => {
 *     // Compute messages
 *     return displayedMessages;
 *   });
 * }
 * 
 * addMessage(msg: CmuxMessage): void {
 *   this.messages.set(msg.id, msg);
 *   this.cache.invalidateAll();  // Single call
 * }
 * ```
 */
export class CacheManager {
  private caches = new Map<string, any>();

  /**
   * Get or compute a cached value.
   * @param key Unique cache key
   * @param compute Function to compute value if not cached
   * @returns Cached or freshly computed value
   */
  get<T>(key: string, compute: () => T): T {
    if (this.caches.has(key)) {
      return this.caches.get(key) as T;
    }

    const value = compute();
    this.caches.set(key, value);
    return value;
  }

  /**
   * Invalidate all caches.
   * Call this after any mutation to state.
   */
  invalidateAll(): void {
    this.caches.clear();
  }

  /**
   * Invalidate specific cache key.
   * Rarely needed - prefer invalidateAll().
   */
  invalidate(key: string): void {
    this.caches.delete(key);
  }

  /**
   * Check if a key is cached.
   */
  has(key: string): boolean {
    return this.caches.has(key);
  }

  /**
   * Get number of cached entries (for debugging/testing).
   */
  get size(): number {
    return this.caches.size;
  }
}
