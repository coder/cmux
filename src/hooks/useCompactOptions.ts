/**
 * Hook to manage compact options with consistent defaults
 * Ensures both modal and slash command paths use same model resolution
 */

import { useState, useCallback } from "react";
import type { CompactOptions } from "@/utils/chatCommands";
import { resolveCompactionModel } from "@/utils/messages/compactionModelPreference";

export function useCompactOptions() {
  const [options, setOptions] = useState<CompactOptions>(() => {
    // Initialize with preferred compaction model
    const preferredModel = resolveCompactionModel(undefined);
    return preferredModel ? { model: preferredModel } : {};
  });

  // Reset to defaults (preserving preferred model)
  const resetOptions = useCallback(() => {
    const preferredModel = resolveCompactionModel(undefined);
    setOptions(preferredModel ? { model: preferredModel } : {});
  }, []);

  return { options, setOptions, resetOptions };
}
