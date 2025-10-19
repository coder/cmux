#!/usr/bin/env bun

/**
 * Generates Prism CSS stylesheet from vscDarkPlus theme
 * Used for syntax highlighting when react-syntax-highlighter has useInlineStyles={false}
 * 
 * Strips backgrounds to preserve diff backgrounds in Review tab
 * Omits font-family and font-size to inherit from parent components
 */

import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { CSSProperties } from "react";

const OUTPUT_PATH = "src/styles/prism-syntax.css";

// Strip backgrounds like we do in syntaxHighlighting.ts
const syntaxStyleNoBackgrounds: Record<string, CSSProperties> = {};
for (const [key, value] of Object.entries(vscDarkPlus as Record<string, unknown>)) {
  if (typeof value === "object" && value !== null) {
    const { background, backgroundColor, ...rest } = value as Record<string, unknown>;
    if (Object.keys(rest).length > 0) {
      syntaxStyleNoBackgrounds[key] = rest as CSSProperties;
    }
  }
}

// Convert CSS properties object to CSS string
function cssPropertiesToString(props: CSSProperties): string {
  return Object.entries(props)
    .filter(([key]) => {
      // Skip font-family and font-size - we want to inherit these
      return key !== "fontFamily" && key !== "fontSize";
    })
    .map(([key, value]) => {
      // Convert camelCase to kebab-case
      const cssKey = key.replace(/([A-Z])/g, "-$1").toLowerCase();
      return `  ${cssKey}: ${value};`;
    })
    .join("\n");
}

// Generate CSS content
function generateCSS(): string {
  const lines: string[] = [
    "/**",
    " * Auto-generated Prism syntax highlighting styles",
    " * Based on VS Code Dark+ theme with backgrounds removed",
    " * Used when react-syntax-highlighter has useInlineStyles={false}",
    " *",
    " * Font family and size are intentionally omitted to inherit from parent.",
    " * ",
    " * To regenerate: bun run scripts/generate_prism_css.ts",
    " */",
    "",
  ];

  for (const [selector, props] of Object.entries(syntaxStyleNoBackgrounds)) {
    const cssRules = cssPropertiesToString(props);
    if (cssRules.trim().length > 0) {
      // Handle selectors that need .token prefix
      let cssSelector = selector;

      // Add .token prefix for single-word selectors (token types)
      if (!/[ >[\]:.]/.test(selector) && !selector.startsWith("pre") && !selector.startsWith("code")) {
        cssSelector = `.token.${selector}`;
      }

      lines.push(`${cssSelector} {`);
      lines.push(cssRules);
      lines.push("}");
      lines.push("");
    }
  }

  return lines.join("\n");
}

async function main() {
  console.log("Generating Prism CSS stylesheet...");

  const css = generateCSS();

  console.log(`Writing CSS to ${OUTPUT_PATH}...`);
  await Bun.write(OUTPUT_PATH, css);

  console.log("✓ Prism CSS generated successfully");
}

main().catch((error) => {
  console.error("Error generating Prism CSS:", error);
  process.exit(1);
});

