import { createHighlighter, type Highlighter } from 'shiki';

// Singleton promise (cached to prevent race conditions)
// Multiple concurrent calls will await the same Promise
let highlighterPromise: Promise<Highlighter> | null = null;

/**
 * Get or create Shiki highlighter instance
 * Lazy-loads WASM and themes on first call
 * Thread-safe: concurrent calls share the same initialization Promise
 */
export async function getShikiHighlighter(): Promise<Highlighter> {
  // Must use if-check instead of ??= to prevent race condition
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: ['dark-plus'],
      langs: [
        'typescript',
        'javascript',
        'tsx',
        'jsx',
        'python',
        'rust',
        'go',
        'java',
        'c',
        'cpp',
        'html',
        'css',
        'json',
        'yaml',
        'markdown',
        'bash',
        'shell',
        'sql',
        'xml',
      ],
    });
  }
  return highlighterPromise;
}

/**
 * Map file extensions/languages to Shiki language IDs
 * Reuses existing getLanguageFromPath logic
 */
export function mapToShikiLang(detectedLang: string): string {
  // Most languages match 1:1, but handle special cases
  const mapping: Record<string, string> = {
    text: 'plaintext',
    sh: 'bash',
    // Add more mappings if needed
  };
  return mapping[detectedLang] || detectedLang;
}

