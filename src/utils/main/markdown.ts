/**
 * Extract the content under a heading titled "Mode: <mode>" (case-insensitive).
 *
 * We intentionally avoid pulling in a full Markdown parser here. The instruction
 * files we ingest are authored by humans and use simple ATX headings (`#`), so a
 * lightweight line-based parser keeps the implementation dependency-free while
 * remaining easy to reason about and test.
 */
export function extractModeSection(markdown: string, mode: string): string | null {
  if (markdown.trim().length === 0 || mode.trim().length === 0) {
    return null;
  }

  const target = `mode: ${mode}`.toLowerCase();
  const lines = markdown.split(/\r?\n/);

  const headingRegex = /^\s*(#{1,6})\s+(.+?)\s*$/;
  const trailingHashesRegex = /\s+#+\s*$/;

  for (let index = 0; index < lines.length; index++) {
    const headingMatch = headingRegex.exec(lines[index]);
    if (!headingMatch) {
      continue;
    }

    const headingLevel = headingMatch[1].length;
    const headingText = headingMatch[2]
      .replace(trailingHashesRegex, "")
      .trim()
      .toLowerCase();

    if (headingText !== target) {
      continue;
    }

    const contentStart = index + 1;
    let contentEnd = lines.length;

    for (let next = contentStart; next < lines.length; next++) {
      const nextMatch = headingRegex.exec(lines[next]);
      if (!nextMatch) {
        continue;
      }

      const nextLevel = nextMatch[1].length;
      if (nextLevel <= headingLevel) {
        contentEnd = next;
        break;
      }
    }

    const slice = lines.slice(contentStart, contentEnd).join("\n").trim();
    return slice.length > 0 ? slice : null;
  }

  return null;
}
