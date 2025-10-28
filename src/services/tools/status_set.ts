import { tool } from "ai";
import type { ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";

/**
 * Result type for status_set tool
 */
export type StatusSetToolResult =
  | {
      success: true;
      emoji: string;
      message: string;
    }
  | {
      success: false;
      error: string;
    };

/**
 * Validates that a string is a single emoji character
 * Uses Intl.Segmenter to count grapheme clusters (handles variation selectors, skin tones, etc.)
 */
function isValidEmoji(str: string): boolean {
  if (!str) return false;

  // Use Intl.Segmenter to count grapheme clusters (what users perceive as single characters)
  // This properly handles emojis with variation selectors (like ✏️), skin tones, flags, etc.
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  const segments = [...segmenter.segment(str)];

  // Must be exactly one grapheme cluster
  if (segments.length !== 1) {
    return false;
  }

  // Check if it's an emoji using Unicode properties
  const emojiRegex = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
  return emojiRegex.test(segments[0].segment);
}

/**
 * Status set tool factory for AI assistant
 * Creates a tool that allows the AI to set status indicator showing current activity
 * @param config Required configuration (not used for this tool, but required by interface)
 */
export const createStatusSetTool: ToolFactory = () => {
  return tool({
    description: TOOL_DEFINITIONS.status_set.description,
    inputSchema: TOOL_DEFINITIONS.status_set.schema,
    execute: ({ emoji, message }): Promise<StatusSetToolResult> => {
      // Validate emoji
      if (!isValidEmoji(emoji)) {
        return Promise.resolve({
          success: false,
          error: "emoji must be a single emoji character",
        });
      }

      // Tool execution is a no-op on the backend
      // The status is tracked by StreamingMessageAggregator and displayed in the frontend
      return Promise.resolve({
        success: true,
        emoji,
        message,
      });
    },
  });
};
