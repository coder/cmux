import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import type { WorkspaceMetadata } from "@/types/workspace";

// The PRELUDE is intentionally minimal to not conflict with the user's instructions.
// cmux is designed to be model agnostic, and models have shown large inconsistency in how they
// follow instructions.
const PRELUDE = `
<prelude>
You are a coding agent.
  
<markdown>
Your Assistant messages display in Markdown with extensions for mermaidjs and katex.

When creating mermaid diagrams:
- Avoid side-by-side subgraphs (they display too wide)
- For comparisons, use separate diagram blocks or single graph with visual separation
- When using custom fill colors, include contrasting color property (e.g., "style note fill:#ff6b6b,color:#fff")
- Make good use of visual space: e.g. use inline commentary
- Wrap node labels containing brackets or special characters in quotes (e.g., Display["Message[]"] not Display[Message[]])

Use GitHub-style \`<details>/<summary>\` tags to create collapsible sections for lengthy content, error traces, or supplementary information. Toggles help keep responses scannable while preserving detail.
</markdown>
</prelude>
`;

function buildEnvironmentContext(workspacePath: string): string {
  return `
<environment>
You are in a git worktree at ${workspacePath}

- This IS a git repository - run git commands directly (no cd needed)
- Tools run here automatically
- Do not modify or visit other worktrees (especially the main project) without explicit user intent
- You are meant to do your work isolated from the user and other agents
</environment>
`;
}

const CUSTOM_INSTRUCTION_FILES = ["AGENTS.md", "AGENT.md", "CLAUDE.md"];

async function readInstructionSet(rootDirectory: string): Promise<string | null> {
  if (!rootDirectory) {
    throw new Error("Invalid rootDirectory: expected non-empty string");
  }

  let baseContent: string | null = null;

  for (const filename of CUSTOM_INSTRUCTION_FILES) {
    try {
      const filePath = path.join(rootDirectory, filename);
      const content = await fs.readFile(filePath, "utf-8");
      baseContent = content;
      break;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_error) {
      continue;
    }
  }

  if (!baseContent) {
    return null;
  }

  try {
    const localFilePath = path.join(rootDirectory, "AGENTS.local.md");
    const localContent = await fs.readFile(localFilePath, "utf-8");
    return `${baseContent}\n\n${localContent}`;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (_error) {
    return baseContent;
  }
}

/**
 * Builds a system message for the AI model by combining a placeholder message
 * with custom instructions from the workspace (if found) and from the
 * default cmux configuration directory (~/.cmux).
 *
 * Searches each location for custom instruction files in priority order:
 * 1. AGENTS.md
 * 2. AGENT.md
 * 3. CLAUDE.md
 *
 * If any of the above files are found in a location, it also looks for
 * AGENTS.local.md in that same directory and appends its contents (useful
 * for local-only instructions).
 *
 * @param metadata - Workspace metadata containing the workspace path
 * @param additionalSystemInstructions - Optional additional system instructions to append at the end
 * @returns System message string (placeholder + custom instructions if found + additional instructions)
 * @throws Error if metadata is invalid or workspace path is missing
 */
export async function buildSystemMessage(
  metadata: WorkspaceMetadata,
  additionalSystemInstructions?: string
): Promise<string> {
  // Validate metadata early
  if (!metadata?.workspacePath) {
    throw new Error("Invalid workspace metadata: workspacePath is required");
  }

  const environmentContext = buildEnvironmentContext(metadata.workspacePath);
  const instructionSegments: string[] = [];

  const defaultCmuxDirectory = path.join(os.homedir(), ".cmux");
  if (
    defaultCmuxDirectory &&
    path.resolve(defaultCmuxDirectory) !== path.resolve(metadata.workspacePath)
  ) {
    const globalInstructions = await readInstructionSet(defaultCmuxDirectory);
    if (globalInstructions) {
      instructionSegments.push(globalInstructions);
    }
  }

  const workspaceInstructions = await readInstructionSet(metadata.workspacePath);
  if (workspaceInstructions) {
    instructionSegments.push(workspaceInstructions);
  }

  const customInstructions = instructionSegments.join("\n\n");

  // Build the final system message
  const trimmedPrelude = PRELUDE.trim();
  let systemMessage = `${trimmedPrelude}\n\n${environmentContext}`;

  // Add custom instructions if found
  if (customInstructions) {
    systemMessage += `\n<custom-instructions>\n${customInstructions}\n</custom-instructions>`;
  }

  // Add additional system instructions at the end (highest priority)
  if (additionalSystemInstructions) {
    systemMessage += `\n\n<additional-instructions>\n${additionalSystemInstructions}\n</additional-instructions>`;
  }

  return systemMessage;
}
