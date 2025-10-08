"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AsyncMutex = void 0;
/**
 * AsyncMutex - A mutual exclusion lock for async operations
 *
 * Ensures only one async operation can hold the lock at a time.
 * Uses `using` declarations for guaranteed lock release.
 *
 * Example:
 * ```typescript
 * const mutex = new AsyncMutex();
 * await using lock = await mutex.acquire();
 * // Critical section - only one execution at a time
 * // Lock automatically released when scope exits
 * ```
 */
class AsyncMutex {
    locked = false;
    queue = [];
    /**
     * Acquire the lock. Blocks until lock is available.
     * Returns an AsyncDisposable lock that auto-releases on scope exit.
     */
    async acquire() {
        // Wait in queue until lock is available
        while (this.locked) {
            await new Promise((resolve) => this.queue.push(resolve));
        }
        this.locked = true;
        return new AsyncMutexLock(this);
    }
    /**
     * Release the lock and wake up next waiter in queue
     * @internal - Should only be called by AsyncMutexLock
     */
    release() {
        this.locked = false;
        const next = this.queue.shift();
        if (next) {
            next(); // Wake up next waiter
        }
    }
}
exports.AsyncMutex = AsyncMutex;
/**
 * AsyncMutexLock - Auto-releasing lock handle
 *
 * Implements AsyncDisposable to ensure lock is released when scope exits.
 * This provides static compile-time guarantees against lock leaks.
 */
class AsyncMutexLock {
    mutex;
    constructor(mutex) {
        this.mutex = mutex;
    }
    /**
     * Release the lock when the `using` block exits
     */
    [Symbol.asyncDispose]() {
        this.mutex.release();
        return Promise.resolve();
    }
}
//# sourceMappingURL=asyncMutex.js.map