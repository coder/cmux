/**
 * Truncation utilities for UI text display
 */

/**
 * Truncate a string from the start, showing the end with ellipsis prefix.
 * Useful for long model names where the end is most distinctive.
 *
 * Examples:
 * - "anthropic:claude-sonnet-4-5" (25 chars) with maxLength 20 -> "...laude-sonnet-4-5"
 * - "short" (5 chars) with maxLength 20 -> "short"
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length including ellipsis (default: 20)
 * @returns Truncated text with leading ellipsis if needed
 */
export function truncateFromStart(text: string, maxLength: number = 20): string {
  if (text.length <= maxLength) {
    return text;
  }

  // Reserve 3 characters for "..."
  const keepLength = maxLength - 3;
  return "..." + text.slice(-keepLength);
}
