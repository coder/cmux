import { useCallback, useEffect } from "react";
import { usePersistedState } from "./usePersistedState";
import { MODEL_ABBREVIATIONS } from "@/utils/slashCommands/registry";

const MAX_LRU_SIZE = 8;
const LRU_KEY = "model-lru";

// Default models from abbreviations (for initial LRU population)
const DEFAULT_MODELS = Object.values(MODEL_ABBREVIATIONS);

/**
 * Hook to manage a Least Recently Used (LRU) cache of AI models.
 * Stores up to 8 recently used models in localStorage.
 * Initializes with default abbreviated models if empty.
 */
export function useModelLRU() {
  const [recentModels, setRecentModels] = usePersistedState<string[]>(LRU_KEY, []);

  // Ensure default models are always present in the LRU (only once on mount)
  useEffect(() => {
    setRecentModels((prev) => {
      // If empty, just use defaults
      if (prev.length === 0) {
        return DEFAULT_MODELS.slice(0, MAX_LRU_SIZE);
      }

      // If we have some models, merge with defaults (keeping existing order, adding missing defaults at end)
      const merged = [...prev];
      for (const defaultModel of DEFAULT_MODELS) {
        if (!merged.includes(defaultModel)) {
          merged.push(defaultModel);
        }
      }

      // Limit to MAX_LRU_SIZE
      return merged.slice(0, MAX_LRU_SIZE);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  /**
   * Add a model to the LRU cache. If it already exists, move it to the front.
   * If the cache is full, remove the least recently used model.
   */
  const addModel = useCallback(
    (modelString: string) => {
      setRecentModels((prev) => {
        // Remove model if it already exists
        const filtered = prev.filter((m) => m !== modelString);

        // Add to front
        const updated = [modelString, ...filtered];

        // Limit to MAX_LRU_SIZE
        return updated.slice(0, MAX_LRU_SIZE);
      });
    },
    [setRecentModels]
  );

  /**
   * Get the list of recently used models, most recent first.
   */
  const getRecentModels = useCallback(() => {
    return recentModels;
  }, [recentModels]);

  return {
    addModel,
    getRecentModels,
    recentModels,
  };
}
