/**
 * Compaction options transformation
 *
 * Single source of truth for converting compaction metadata into SendMessageOptions.
 * Used by both ChatInput (initial send) and useResumeManager (resume after interruption).
 */

import type { SendMessageOptions } from "@/types/ipc";
import type { CompactionRequestData } from "@/types/message";

/**
 * Apply compaction-specific option overrides to base options.
 *
 * This function is the single source of truth for how compaction metadata
 * transforms workspace defaults. Both initial sends and stream resumption
 * use this function to ensure consistent behavior.
 *
 * @param baseOptions - Workspace default options (from localStorage or useSendMessageOptions)
 * @param compactData - Compaction request metadata from /compact command
 * @returns Final SendMessageOptions with compaction overrides applied
 */
export function applyCompactionOverrides(
  baseOptions: SendMessageOptions,
  compactData: CompactionRequestData
): SendMessageOptions {
  // Use custom model if specified, otherwise use workspace default
  const compactionModel = compactData.model ?? baseOptions.model;

  // Anthropic models don't support thinking, always use "off"
  // Non-Anthropic models keep workspace default (backend will enforce policy)
  const isAnthropic = compactionModel.startsWith("anthropic:");

  return {
    ...baseOptions,
    model: compactionModel,
    thinkingLevel: isAnthropic ? "off" : baseOptions.thinkingLevel,
    toolPolicy: [{ regex_match: "compact_summary", action: "require" }],
    maxOutputTokens: compactData.maxOutputTokens,
    mode: "compact" as const,
  };
}
