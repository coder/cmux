/**
 * Hook for debouncing callback functions.
 * Delays execution until after a specified wait time has elapsed since the last call.
 */

import { useRef, useCallback, useEffect } from "react";
import { strict as assert } from "node:assert";

/**
 * Creates a debounced version of a callback function.
 * The callback will only execute after the specified delay has passed
 * since the last invocation.
 *
 * @param callback - Function to debounce
 * @param delayMs - Delay in milliseconds before executing the callback
 * @returns Debounced version of the callback
 *
 * @example
 * ```typescript
 * const debouncedFetch = useDebouncedCallback(async () => {
 *   await fetchData();
 * }, 200);
 *
 * // Call multiple times rapidly - only executes once after 200ms
 * debouncedFetch();
 * debouncedFetch();
 * debouncedFetch();
 * ```
 */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number
): (...args: Args) => void {
  assert(typeof callback === "function", "useDebouncedCallback expects callback to be a function");
  assert(
    delayMs >= 0 && !isNaN(delayMs) && isFinite(delayMs),
    "useDebouncedCallback expects delayMs to be a non-negative, finite number"
  );

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (...args: Args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        assert(
          callbackRef.current !== null && typeof callbackRef.current === "function",
          "callbackRef.current must be a function"
        );
        callbackRef.current(...args);
        timeoutRef.current = null;
      }, delayMs);
    },
    [delayMs]
  );
}
