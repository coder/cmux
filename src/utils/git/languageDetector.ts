/**
 * Language detection for syntax highlighting in diffs
 * Maps file paths to Prism language identifiers
 */

// Note: Using require because the ESM export is broken in detect-programming-language
// eslint-disable-next-line @typescript-eslint/no-var-requires
const getProgrammingLanguage = require("detect-programming-language").default as (
  fileName: string
) => string | undefined;

/**
 * Map GitHub Linguist language names to Prism language identifiers
 * Only includes mappings where the names differ
 */
const LINGUIST_TO_PRISM: Record<string, string> = {
  // Common languages where names differ or need explicit mapping
  TypeScript: "typescript",
  JavaScript: "javascript",
  Python: "python",
  Rust: "rust",
  Ruby: "ruby",
  Go: "go",
  Java: "java",
  "C++": "cpp",
  Smalltalk: "csharp", // The library returns "Smalltalk" for .cs files
  PHP: "php",
  Swift: "swift",
  Kotlin: "kotlin",
  Scala: "scala",
  Haskell: "haskell",
  Clojure: "clojure",
  Elixir: "elixir",
  Erlang: "erlang",
  Lua: "lua",
  Perl: "perl",
  R: "r",
  Shell: "bash",
  PowerShell: "powershell",
  TSQL: "sql", // The library returns "TSQL" for .sql files
  SCSS: "scss",
  Sass: "sass",
  Less: "less",
  TOML: "toml",
  "Objective-C": "objectivec",
  Dart: "dart",
  Groovy: "groovy",
  GraphQL: "graphql",
  Solidity: "solidity",
  WebAssembly: "wasm",
  Vim: "vim",
  // TSX/JSX are special cases handled by extension
  TSX: "tsx",
  JSX: "jsx",
};

/**
 * Extensions that the library doesn't recognize
 * Map them directly to Prism language identifiers
 */
const EXT_TO_PRISM: Record<string, string> = {
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  md: "markdown",
  markdown: "markdown",
};

/**
 * Get Prism language identifier from file path
 * @param filePath - Path to file (can be relative or absolute)
 * @returns Prism language identifier or 'text' if unknown
 */
export function getLanguageFromPath(filePath: string): string {
  // Extract extension (handle case-insensitivity and multi-dot filenames)
  const parts = filePath.split("/").pop()?.split(".") || [];
  if (parts.length < 2) {
    // Special case: Dockerfile and Makefile have no extension
    const fileName = parts[0]?.toLowerCase();
    if (fileName === "dockerfile") return "docker";
    if (fileName === "makefile") return "makefile";
    return "text";
  }

  // Get the last part as extension, lowercase for consistency
  const ext = parts[parts.length - 1].toLowerCase();

  // TSX and JSX need special handling
  if (ext === "tsx") return "tsx";
  if (ext === "jsx") return "jsx";

  // Check direct extension mapping first (for extensions the library doesn't recognize)
  if (EXT_TO_PRISM[ext]) return EXT_TO_PRISM[ext];

  // Normalize the filename to lowercase for the library
  // (it only recognizes lowercase extensions)
  const normalizedPath = filePath.toLowerCase();

  // Use detect-programming-language to get GitHub Linguist name
  const linguistName = getProgrammingLanguage(normalizedPath);

  // If no language detected, fallback to text
  if (!linguistName) return "text";

  // Map to Prism identifier (if mapping exists) or lowercase linguist name
  const prismLang = LINGUIST_TO_PRISM[linguistName];
  if (prismLang) return prismLang;

  // Default: lowercase the linguist name (works for many languages)
  return linguistName.toLowerCase();
}
