/**
 * Search term highlighting for diff content
 * Computes Shiki decorations for search matches
 */

import { LRUCache } from "lru-cache";

export interface SearchHighlightConfig {
  searchTerm: string;
  useRegex: boolean;
  matchCase: boolean;
}

export interface SearchDecoration {
  start: number;
  end: number;
  properties: { class: string };
}

// LRU cache for compiled regex patterns
// Key: search config string, Value: compiled RegExp
const regexCache = new LRUCache<string, RegExp>({
  max: 100, // Max 100 unique search patterns (plenty for typical usage)
});

/**
 * Escape special regex characters for literal string matching
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Highlight search matches in plain text by wrapping in <mark> tags
 * Useful for highlighting non-code text like file paths
 *
 * @param text - Plain text to highlight
 * @param config - Search configuration
 * @returns HTML string with matches wrapped in <mark class="search-highlight">
 */
export function highlightSearchInText(text: string, config: SearchHighlightConfig): string {
  const { searchTerm, useRegex, matchCase } = config;

  // No highlighting if search term is empty
  if (!searchTerm.trim()) {
    return text;
  }

  try {
    // Build regex pattern (with caching)
    const regexCacheKey = `${searchTerm}:${useRegex}:${matchCase}`;
    let pattern = regexCache.get(regexCacheKey);

    if (!pattern) {
      try {
        pattern = useRegex
          ? new RegExp(searchTerm, matchCase ? "g" : "gi")
          : new RegExp(escapeRegex(searchTerm), matchCase ? "g" : "gi");
        regexCache.set(regexCacheKey, pattern);
      } catch {
        // Invalid regex pattern - return original text
        return text;
      }
    }

    let result = "";
    let lastIndex = 0;
    pattern.lastIndex = 0;

    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Add text before match
      if (match.index > lastIndex) {
        result += text.slice(lastIndex, match.index);
      }

      // Add highlighted match
      result += `<mark class="search-highlight">${match[0]}</mark>`;

      lastIndex = match.index + match[0].length;

      // Prevent infinite loop on zero-length matches
      if (match[0].length === 0) {
        pattern.lastIndex++;
      }
    }

    // Add remaining text after last match
    if (lastIndex < text.length) {
      result += text.slice(lastIndex);
    }

    return result;
  } catch (error) {
    console.warn("Failed to highlight search in text:", error);
    return text;
  }
}

/**
 * Compute decorations for search matches in text
 * Returns character positions for highlighting
 *
 * @param text - Plain text content to search
 * @param config - Search configuration
 * @returns Array of decorations marking search matches
 */
export function computeSearchDecorations(
  text: string,
  config: SearchHighlightConfig
): SearchDecoration[] {
  const { searchTerm, useRegex, matchCase } = config;

  // No decorations if search term is empty
  if (!searchTerm.trim()) {
    return [];
  }

  try {
    // Build regex pattern (with caching)
    const regexCacheKey = `${searchTerm}:${useRegex}:${matchCase}`;
    let pattern = regexCache.get(regexCacheKey);

    if (!pattern) {
      try {
        pattern = useRegex
          ? new RegExp(searchTerm, matchCase ? "g" : "gi")
          : new RegExp(escapeRegex(searchTerm), matchCase ? "g" : "gi");
        regexCache.set(regexCacheKey, pattern);
      } catch {
        // Invalid regex pattern - return no decorations
        return [];
      }
    }

    const decorations: SearchDecoration[] = [];
    pattern.lastIndex = 0; // Reset regex state

    let match;
    while ((match = pattern.exec(text)) !== null) {
      decorations.push({
        start: match.index,
        end: match.index + match[0].length,
        properties: { class: "search-highlight" },
      });

      // Prevent infinite loop on zero-length matches
      if (match[0].length === 0) {
        pattern.lastIndex++;
      }
    }

    return decorations;
  } catch (error) {
    // Failed to process - return no decorations
    console.warn("Failed to compute search decorations:", error);
    return [];
  }
}
