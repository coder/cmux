import type { Dispatch, SetStateAction } from "react";
import { useState, useCallback, useEffect } from "react";

type SetValue<T> = T | ((prev: T) => T);

interface UsePersistedStateOptions {
  /** Enable listening to storage changes from other components/tabs */
  listener?: boolean;
}

/**
 * Custom hook that persists state to localStorage with automatic synchronization.
 * Follows React's useState API while providing localStorage persistence.
 *
 * @param key - Unique localStorage key
 * @param initialValue - Default value if localStorage is empty or invalid
 * @param options - Optional configuration { listener: true } for cross-component sync
 * @returns [state, setState] tuple matching useState API
 */
export function usePersistedState<T>(
  key: string,
  initialValue: T,
  options?: UsePersistedStateOptions
): [T, Dispatch<SetStateAction<T>>] {
  // Lazy initialization - only runs on first render
  const [state, setState] = useState<T>(() => {
    // Handle SSR and environments without localStorage
    if (typeof window === "undefined" || !window.localStorage) {
      return initialValue;
    }

    try {
      const storedValue = window.localStorage.getItem(key);
      if (storedValue === null) {
        return initialValue;
      }

      // Handle 'undefined' string case
      if (storedValue === "undefined") {
        return initialValue;
      }

      return JSON.parse(storedValue) as T;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Enhanced setState that supports functional updates
  const setPersistedState = useCallback(
    (value: SetValue<T>) => {
      setState((prevState) => {
        const newValue = value instanceof Function ? value(prevState) : value;

        // Persist to localStorage
        if (typeof window !== "undefined" && window.localStorage) {
          try {
            if (newValue === undefined || newValue === null) {
              window.localStorage.removeItem(key);
            } else {
              window.localStorage.setItem(key, JSON.stringify(newValue));
            }

            // Dispatch custom event for same-tab synchronization
            const customEvent = new CustomEvent(`storage-change:${key}`, {
              detail: { key, newValue },
            });
            window.dispatchEvent(customEvent);
          } catch (error) {
            console.warn(`Error writing to localStorage key "${key}":`, error);
          }
        }

        return newValue;
      });
    },
    [key]
  );

  // Listen for storage changes when listener option is enabled
  useEffect(() => {
    if (!options?.listener) return;

    let rafId: number | null = null;

    const handleStorageChange = (e: Event) => {
      // Cancel any pending update
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }

      // Batch update to next animation frame to prevent jittery scroll
      rafId = requestAnimationFrame(() => {
        rafId = null;

        if (e instanceof StorageEvent) {
          // Cross-tab storage event
          if (e.key === key && e.newValue !== null) {
            try {
              const newValue = JSON.parse(e.newValue) as T;
              setState(newValue);
            } catch (error) {
              console.warn(`Error parsing storage event for key "${key}":`, error);
            }
          }
        } else if (e instanceof CustomEvent) {
          // Same-tab custom event
          const detail = e.detail as { key: string; newValue: T };
          if (detail.key === key) {
            setState(detail.newValue);
          }
        }
      });
    };

    // Listen to both storage events (cross-tab) and custom events (same-tab)
    window.addEventListener("storage", handleStorageChange);
    window.addEventListener(`storage-change:${key}`, handleStorageChange);

    return () => {
      // Cancel pending animation frame
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener(`storage-change:${key}`, handleStorageChange);
    };
  }, [key, options?.listener]);

  return [state, setPersistedState];
}
