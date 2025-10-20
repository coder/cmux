import { createHighlighterCore, type HighlighterCore } from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";

// Shiki theme used throughout the application
export const SHIKI_THEME = "min-dark";

// Maximum diff size to highlight (in bytes)
// Diffs larger than this will fall back to plain text for performance
export const MAX_DIFF_SIZE_BYTES = 32768; // 32kb

// Singleton promise (cached to prevent race conditions)
// Multiple concurrent calls will await the same Promise
let highlighterPromise: Promise<HighlighterCore> | null = null;

/**
 * Get or create Shiki highlighter instance
 * Lazy-loads WASM and themes on first call
 * Thread-safe: concurrent calls share the same initialization Promise
 */
export async function getShikiHighlighter(): Promise<HighlighterCore> {
  // Must use if-check instead of ??= to prevent race condition
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const [engine, theme] = await Promise.all([
        createOnigurumaEngine(import("shiki/wasm")),
        import("shiki/themes/min-dark.mjs"),
      ]);

      return createHighlighterCore({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        themes: [theme.default as any],
        langs: [], // Load languages on-demand via highlightDiffChunk
        engine,
      });
    })();
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
    text: "plaintext",
    sh: "bash",
    // Add more mappings if needed
  };
  return mapping[detectedLang] || detectedLang;
}
