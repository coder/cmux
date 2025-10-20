/**
 * Search term highlighting for diff content
 * Post-processes Shiki-highlighted HTML to add search match highlights
 */

export interface SearchHighlightConfig {
  searchTerm: string;
  useRegex: boolean;
  matchCase: boolean;
}

/**
 * Escape special regex characters for literal string matching
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Walk all text nodes in a DOM tree and apply a callback
 */
function walkTextNodes(node: Node, callback: (textNode: Text) => void): void {
  if (node.nodeType === Node.TEXT_NODE) {
    callback(node as Text);
  } else {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      walkTextNodes(child, callback);
    }
  }
}

/**
 * Wrap search matches in HTML with <mark> tags
 * Preserves existing HTML structure (e.g., Shiki syntax highlighting)
 *
 * @param html - HTML content to process (e.g., from Shiki)
 * @param config - Search configuration
 * @returns HTML with search matches wrapped in <mark class="search-highlight">
 */
export function highlightSearchMatches(html: string, config: SearchHighlightConfig): string {
  const { searchTerm, useRegex, matchCase } = config;

  // No highlighting if search term is empty
  if (!searchTerm.trim()) {
    return html;
  }

  try {
    // Parse HTML into DOM for safe manipulation
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Build regex pattern
    let pattern: RegExp;
    try {
      pattern = useRegex
        ? new RegExp(searchTerm, matchCase ? "g" : "gi")
        : new RegExp(escapeRegex(searchTerm), matchCase ? "g" : "gi");
    } catch {
      // Invalid regex pattern - return original HTML
      return html;
    }

    // Walk all text nodes and wrap matches
    walkTextNodes(doc.body, (textNode) => {
      const text = textNode.textContent || "";

      // Quick check: does this text node contain any matches?
      pattern.lastIndex = 0; // Reset regex state
      if (!pattern.test(text)) {
        return;
      }

      // Build replacement fragment with wrapped matches
      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      pattern.lastIndex = 0; // Reset again for actual iteration

      let match;
      while ((match = pattern.exec(text)) !== null) {
        // Add text before match
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }

        // Add highlighted match
        const mark = document.createElement("mark");
        mark.className = "search-highlight";
        mark.textContent = match[0];
        fragment.appendChild(mark);

        lastIndex = match.index + match[0].length;

        // Prevent infinite loop on zero-length matches
        if (match[0].length === 0) {
          pattern.lastIndex++;
        }
      }

      // Add remaining text after last match
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      // Replace text node with fragment
      textNode.parentNode?.replaceChild(fragment, textNode);
    });

    return doc.body.innerHTML;
  } catch (error) {
    // Failed to parse/process - return original HTML
    console.warn("Failed to highlight search matches:", error);
    return html;
  }
}
