import { unified } from "unified";
import remarkParse from "remark-parse";
import { toString as mdToString } from "mdast-util-to-string";
import type { Root, Content, Heading } from "mdast";

function isHeading(node: Content): node is Heading {
  return node.type === "heading";
}

/**
 * Extract the content under a heading titled "Mode: <mode>" (case-insensitive).
 * - Matches any heading level (#..######)
 * - Returns raw markdown content between this heading and the next heading
 *   of the same or higher level in the same document
 * - If multiple sections match, the first one wins
 * - The heading line itself is excluded from the returned content
 */
export function extractModeSection(markdown: string, mode: string): string | null {
  if (!markdown || !mode) return null;

  const tree: Root = unified().use(remarkParse).parse(markdown);
  const children = tree.children ?? [];
  const target = `mode: ${mode}`.toLowerCase();

  // Pre-split for line/column slicing without relying on offset
  const lines = markdown.split(/\r?\n/);

  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (!isHeading(node)) continue;

    const heading: Heading = node; // narrowed to Heading
    const text = mdToString(heading).trim().toLowerCase();
    if (text !== target) continue;

    const startDepth = heading.depth || 1;

    // Determine slice start at end of heading line
    const startPos = heading.position?.end;
    if (!startPos) return null; // unexpected, but bail safely

    // Find next boundary heading (same or higher level)
    let endLine = lines.length; // exclusive
    let endColumn = 1;
    for (let j = i + 1; j < children.length; j++) {
      const next = children[j];
      if (isHeading(next)) {
        const depth = next.depth || 1;
        if (depth <= startDepth) {
          endLine = next.position?.start?.line ?? endLine;
          endColumn = next.position?.start?.column ?? endColumn;
          break;
        }
      }
    }

    const slice = sliceByLines(lines, startPos, { line: endLine, column: endColumn });
    const result = slice.trim();
    return result.length > 0 ? result : null;
  }

  return null;
}

function sliceByLines(
  lines: string[],
  start: { line: number; column: number },
  end: { line: number; column: number }
): string {
  const sLineIdx = Math.max(0, start.line - 1);
  const eLineIdx = Math.max(0, Math.min(lines.length - 1, end.line - 1));

  if (sLineIdx > eLineIdx) return "";

  if (sLineIdx === eLineIdx) {
    return lines[sLineIdx].slice(start.column - 1, Math.max(start.column - 1, end.column - 1));
  }

  const first = lines[sLineIdx].slice(start.column - 1);
  const middle = lines.slice(sLineIdx + 1, eLineIdx);
  const last = lines[eLineIdx].slice(0, Math.max(0, end.column - 1));

  return [first, ...middle, last].join("\n");
}

