import * as fs from "fs/promises";
import * as path from "path";
import type { WorkspaceMetadata } from "@/types/workspace";

// The PRELUDE is intentionally minimal to not conflict with the user's instructions.
// cmux is designed to be model agnostic, and models have shown large inconsistency in how they
// follow instructions.
const PRELUDE = `
<prelude>
You are a coding agent.
  
Your Assistant messages display in Markdown with extensions for mermaidjs and katex.

When creating mermaid diagrams:
- Avoid side-by-side subgraphs (they display too wide)
- For comparisons, use separate diagram blocks or single graph with visual separation
- When using custom fill colors, include contrasting color property (e.g., "style note fill:#ff6b6b,color:#fff")
- Make good use of visual space: e.g. use inline commentary
- Wrap node labels containing brackets or special characters in quotes (e.g., Display["Message[]"] not Display[Message[]])
</prelude>
`;

const CUSTOM_INSTRUCTION_FILES = ["AGENTS.md", "AGENT.md", "CLAUDE.md"];

/**
 * Builds a system message for the AI model by combining a placeholder message
 * with custom instructions from the workspace (if found).
 *
 * Searches for custom instruction files in priority order:
 * 1. AGENTS.md
 * 2. AGENT.md
 * 3. CLAUDE.md
 *
 * @param metadata - Workspace metadata containing the workspace path
 * @returns System message string (placeholder + custom instructions if found)
 * @throws Error if metadata is invalid or workspace path is missing
 */
export async function buildSystemMessage(metadata: WorkspaceMetadata): Promise<string> {
  // Validate metadata early
  if (!metadata?.workspacePath) {
    throw new Error("Invalid workspace metadata: workspacePath is required");
  }

  let customInstructions = "";

  // Try to read custom instruction files in order
  for (const filename of CUSTOM_INSTRUCTION_FILES) {
    try {
      const filePath = path.join(metadata.workspacePath, filename);
      const content = await fs.readFile(filePath, "utf-8");
      customInstructions = content;
      break; // Use first found file
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_error) {
      // File doesn't exist or can't be read, try next file
      continue;
    }
  }

  // Combine placeholder with custom instructions
  if (customInstructions) {
    const trimmedPrelude = PRELUDE.trim();
    return `${trimmedPrelude}\n\n<custom-instructions>\n${customInstructions}\n</custom-instructions>`;
  }

  return PRELUDE;
}
