/**
 * Code block enhancement for mdBook documentation
 * Adds Shiki syntax highlighting and line numbers to code blocks
 * Mimics the CodeBlock component from the main cmux app
 */

import { createHighlighter, type Highlighter } from "shiki/bundle/web";

const SHIKI_THEME = "min-dark";
let highlighterPromise: Promise<Highlighter> | null = null;

/**
 * Get or create Shiki highlighter instance (singleton pattern)
 */
async function getShikiHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: [SHIKI_THEME],
      langs: [], // Load languages on-demand
    });
  }
  return highlighterPromise;
}

/**
 * Map language names to Shiki-compatible language IDs
 */
function mapToShikiLang(detectedLang: string): string {
  const mapping: Record<string, string> = {
    text: "plaintext",
    sh: "bash",
    // Add more mappings as needed
  };
  return mapping[detectedLang] || detectedLang;
}

/**
 * Extract line contents from Shiki HTML output
 */
function extractShikiLines(html: string): string[] {
  const codeMatch = /<code[^>]*>(.*?)<\/code>/s.exec(html);
  if (!codeMatch) return [];

  return codeMatch[1].split("\n").map((chunk) => {
    const start = chunk.indexOf('<span class="line">');
    if (start === -1) return "";

    const contentStart = start + '<span class="line">'.length;
    const end = chunk.lastIndexOf("</span>");

    return end > contentStart ? chunk.substring(contentStart, end) : "";
  });
}

/**
 * Create copy button element
 */
function createCopyButton(code: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "copy-button code-copy-button";
  button.setAttribute("aria-label", "Copy to clipboard");

  // Copy icon SVG
  button.innerHTML = `
    <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
  `;

  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code);
      button.innerHTML = '<span class="copy-feedback">Copied!</span>';
      setTimeout(() => {
        button.innerHTML = `
          <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        `;
      }, 2000);
    } catch (error) {
      console.warn("Failed to copy to clipboard:", error);
    }
  });

  return button;
}

/**
 * Transform a code block with Shiki highlighting and line numbers
 */
async function transformCodeBlock(pre: HTMLPreElement): Promise<void> {
  const code = pre.querySelector("code");
  if (!code) return;

  // Extract language from class (e.g., "language-typescript")
  const languageClass = Array.from(code.classList).find((cls) =>
    cls.startsWith("language-")
  );
  if (!languageClass) return;

  const language = languageClass.replace("language-", "");
  const codeText = code.textContent || "";

  // Split into lines for fallback
  const plainLines = codeText
    .split("\n")
    .filter((line, idx, arr) => idx < arr.length - 1 || line !== "");

  let highlightedLines: string[] = plainLines;

  // Try to highlight with Shiki
  try {
    const highlighter = await getShikiHighlighter();
    const shikiLang = mapToShikiLang(language);

    // Load language on-demand if not already loaded
    const loadedLangs = highlighter.getLoadedLanguages();
    if (!loadedLangs.includes(shikiLang)) {
      try {
        await highlighter.loadLanguage(shikiLang);
      } catch {
        console.warn(
          `Language '${shikiLang}' not available in Shiki, using plain text`
        );
      }
    }

    const html = highlighter.codeToHtml(codeText, {
      lang: shikiLang,
      theme: SHIKI_THEME,
    });

    const lines = extractShikiLines(html);
    const filteredLines = lines.filter(
      (line, idx, arr) => idx < arr.length - 1 || line.trim() !== ""
    );
    if (filteredLines.length > 0) {
      highlightedLines = filteredLines;
    }
  } catch (error) {
    console.warn(`Failed to highlight code block (${language}):`, error);
  }

  // Build new structure with line numbers
  const wrapper = document.createElement("div");
  wrapper.className = "code-block-wrapper";

  const container = document.createElement("div");
  container.className = "code-block-container";

  highlightedLines.forEach((lineContent, idx) => {
    const lineNumber = document.createElement("div");
    lineNumber.className = "line-number";
    lineNumber.textContent = String(idx + 1);

    const codeLine = document.createElement("div");
    codeLine.className = "code-line";

    // If we have highlighted HTML, use it; otherwise use plain text
    if (highlightedLines !== plainLines) {
      codeLine.innerHTML = lineContent;
    } else {
      const codeElement = document.createElement("code");
      codeElement.textContent = lineContent;
      codeLine.appendChild(codeElement);
    }

    container.appendChild(lineNumber);
    container.appendChild(codeLine);
  });

  wrapper.appendChild(container);
  wrapper.appendChild(createCopyButton(codeText));

  // Replace original <pre> with new structure
  pre.replaceWith(wrapper);
}

/**
 * Wait for Shiki to load from CDN
 */
async function waitForShiki(maxWaitMs: number = 5000): Promise<void> {
  const startTime = Date.now();
  while (!window.shiki) {
    if (Date.now() - startTime > maxWaitMs) {
      throw new Error("Timeout waiting for Shiki to load from CDN");
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

/**
 * Initialize code block enhancement
 */
async function init(): Promise<void> {
  try {
    // Wait for Shiki to load from CDN
    await waitForShiki();

    // Find all code blocks
    const codeBlocks = document.querySelectorAll("pre > code[class*='language-']");

    // Transform each code block
    const promises = Array.from(codeBlocks).map((code) => {
      const pre = code.parentElement as HTMLPreElement;
      return transformCodeBlock(pre);
    });

    await Promise.all(promises);
  } catch (error) {
    console.error("Failed to initialize code block enhancement:", error);
  }
}

// Run on DOMContentLoaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void init());
} else {
  void init();
}
