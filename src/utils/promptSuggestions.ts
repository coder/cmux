/**
 * Prompt mention (@) suggestions generation
 */

export interface PromptSuggestion {
  id: string;
  name: string;
  location: "repo" | "system";
  replacement: string;
}

/**
 * Get prompt suggestions for the current input
 *
 * Returns suggestions when the input contains "@" followed by optional characters
 * at the current cursor position.
 *
 * @param input - Current input text
 * @param cursorPos - Current cursor position in the input
 * @param prompts - Available prompts from IPC
 * @returns Array of matching prompt suggestions
 */
export function getPromptSuggestions(
  input: string,
  cursorPos: number,
  prompts: Array<{ name: string; path: string; location: "repo" | "system" }>
): PromptSuggestion[] {
  // Get text before cursor
  const textBeforeCursor = input.slice(0, cursorPos);

  // Find the last "@" before the cursor
  const lastAtIndex = textBeforeCursor.lastIndexOf("@");
  if (lastAtIndex === -1) {
    return [];
  }

  // Get the text between @ and cursor
  const afterAt = textBeforeCursor.slice(lastAtIndex + 1);

  // If there's a space after @, don't show suggestions
  if (afterAt.includes(" ") || afterAt.includes("\n")) {
    return [];
  }

  // Get the partial prompt name (text between @ and cursor)
  // This supports typing like "@my-prom" -> shows "my-prompt"
  const partialName = afterAt.toLowerCase();

  // Filter prompts that match the partial name
  return prompts
    .filter((prompt) => {
      if (!partialName) {
        return true; // Show all if just "@"
      }
      return prompt.name.toLowerCase().startsWith(partialName);
    })
    .map((prompt) => ({
      id: `prompt:${prompt.name}`,
      name: prompt.name,
      location: prompt.location,
      replacement: `@${prompt.name}`,
    }))
    .sort((a, b) => {
      // Sort by location (repo first), then by name
      if (a.location !== b.location) {
        return a.location === "repo" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
}

/**
 * Extract all prompt mentions from input text
 *
 * @param input - Input text to parse
 * @returns Array of prompt names mentioned with "@"
 */
export function extractPromptMentions(input: string): string[] {
  // Match @<word> patterns (alphanumeric, hyphens, underscores)
  const mentionRegex = /@([\w-]+)/g;
  const mentions: string[] = [];
  let match;

  while ((match = mentionRegex.exec(input)) !== null) {
    mentions.push(match[1]);
  }

  return mentions;
}

/**
 * Replace prompt mentions with their content
 *
 * @param input - Input text containing @mentions
 * @param promptContents - Map of prompt name to content
 * @returns Input with @mentions expanded to content
 */
export function expandPromptMentions(input: string, promptContents: Map<string, string>): string {
  let result = input;

  // Replace each mention with its content
  // Use negative lookahead/lookbehind to ensure exact word boundaries
  for (const [name, content] of promptContents) {
    const mentionPattern = new RegExp(`@${escapeRegex(name)}(?![\\w-])`, "g");
    result = result.replace(mentionPattern, content);
  }

  return result;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
