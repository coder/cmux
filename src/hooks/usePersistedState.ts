import type { Dispatch, SetStateAction } from "react";
import { useState, useCallback } from "react";

type SetValue<T> = T | ((prev: T) => T);

/**
 * Custom hook that persists state to localStorage with automatic synchronization.
 * Follows React's useState API while providing localStorage persistence.
 *
 * @param key - Unique localStorage key
 * @param initialValue - Default value if localStorage is empty or invalid
 * @returns [state, setState] tuple matching useState API
 */
export function usePersistedState<T>(
  key: string,
  initialValue: T
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
          } catch (error) {
            console.warn(`Error writing to localStorage key "${key}":`, error);
          }
        }

        return newValue;
      });
    },
    [key]
  );

  return [state, setPersistedState];
}
