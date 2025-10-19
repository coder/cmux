import { getShikiHighlighter, mapToShikiLang } from './shikiHighlighter';
import type { DiffChunk } from './diffChunking';

export interface HighlightedLine {
  html: string; // HTML content (already escaped and tokenized)
  lineNumber: number;
  originalIndex: number; // Index in original diff
}

export interface HighlightedChunk {
  type: DiffChunk['type'];
  lines: HighlightedLine[];
  usedFallback: boolean; // True if highlighting failed
}

/**
 * Highlight a chunk of code using Shiki
 * Falls back to plain text on error
 */
export async function highlightDiffChunk(
  chunk: DiffChunk,
  language: string
): Promise<HighlightedChunk> {
  // Fast path: no highlighting for text files
  if (language === 'text' || language === 'plaintext') {
    return {
      type: chunk.type,
      lines: chunk.lines.map((line, i) => ({
        html: escapeHtml(line),
        lineNumber: chunk.lineNumbers[i],
        originalIndex: chunk.startIndex + i,
      })),
      usedFallback: false,
    };
  }

  try {
    const highlighter = await getShikiHighlighter();
    const shikiLang = mapToShikiLang(language);

    // Check if language is supported
    const loadedLangs = highlighter.getLoadedLanguages();
    if (!loadedLangs.includes(shikiLang)) {
      // Language not loaded - fall back to plain text
      return createFallbackChunk(chunk);
    }

    // Highlight entire chunk as one block
    const code = chunk.lines.join('\n');
    const html = highlighter.codeToHtml(code, {
      lang: shikiLang,
      theme: 'dark-plus',
    });

    // Parse HTML to extract line contents
    const lines = extractLinesFromHtml(html);

    // Validate output (detect broken highlighting)
    if (lines.length !== chunk.lines.length) {
      // Mismatch - highlighting broke the structure
      return createFallbackChunk(chunk);
    }

    return {
      type: chunk.type,
      lines: lines.map((html, i) => ({
        html,
        lineNumber: chunk.lineNumbers[i],
        originalIndex: chunk.startIndex + i,
      })),
      usedFallback: false,
    };
  } catch (error) {
    console.warn(`Syntax highlighting failed for language ${language}:`, error);
    return createFallbackChunk(chunk);
  }
}

/**
 * Create plain text fallback for a chunk
 */
function createFallbackChunk(chunk: DiffChunk): HighlightedChunk {
  return {
    type: chunk.type,
    lines: chunk.lines.map((line, i) => ({
      html: escapeHtml(line),
      lineNumber: chunk.lineNumbers[i],
      originalIndex: chunk.startIndex + i,
    })),
    usedFallback: true,
  };
}

/**
 * Extract individual line contents from Shiki's HTML output
 * Shiki wraps output in <pre><code>...</code></pre> with <span> tags for tokens
 */
function extractLinesFromHtml(html: string): string[] {
  // Remove <pre> and <code> wrappers
  const codeRegex = /<code[^>]*>(.*?)<\/code>/s;
  const codeMatch = codeRegex.exec(html);
  if (!codeMatch) return [];

  const codeContent = codeMatch[1];

  // Split by line breaks (Shiki uses <span class="line">...</span> per line)
  const lineRegex = /<span class="line">(.*?)<\/span>/g;
  const lineMatches = codeContent.match(lineRegex);
  if (!lineMatches) {
    // Fallback: split by newlines and escape
    return codeContent.split('\n').map(escapeHtml);
  }

  const extractRegex = /<span class="line">(.*?)<\/span>/;
  return lineMatches.map((lineHtml) => {
    // Extract content from <span class="line">...</span>
    const match = extractRegex.exec(lineHtml);
    return match ? match[1] : '';
  });
}

/**
 * Escape HTML entities for plain text fallback
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

