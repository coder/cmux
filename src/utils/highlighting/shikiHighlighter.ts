import { createHighlighter, type Highlighter } from 'shiki';

// Singleton instance (lazy-loaded on first use)
let highlighterInstance: Highlighter | null = null;

/**
 * Get or create Shiki highlighter instance
 * Lazy-loads WASM and themes on first call
 */
export async function getShikiHighlighter(): Promise<Highlighter> {
  highlighterInstance ??= await createHighlighter({
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
  return highlighterInstance;
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

