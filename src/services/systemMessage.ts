import * as os from "os";
import * as path from "path";
import type { WorkspaceMetadata } from "@/types/workspace";
import { gatherInstructionSets, readInstructionSet } from "@/utils/main/instructionFiles";
import { extractModeSection } from "@/utils/main/markdown";

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

/**
 * The system directory where global cmux configuration lives.
 * This is where users can place global AGENTS.md and .cmux/PLAN.md files
 * that apply to all workspaces.
 */
function getSystemDirectory(): string {
  return path.join(os.homedir(), ".cmux");
}

/**
 * Builds a system message for the AI model by combining multiple instruction sources.
 *
 * Instruction sources are layered in this order:
 * 1. Global instructions: ~/.cmux/AGENTS.md (+ AGENTS.local.md)
 * 2. Workspace instructions: <workspace>/AGENTS.md (+ AGENTS.local.md)
 * 3. Mode-specific context (if mode provided): Extract a section titled "Mode: <mode>"
 *    (case-insensitive) from the instruction file. We search at most one section in
 *    precedence order: workspace instructions first, then global instructions.
 *
 * Each instruction file location is searched for in priority order:
 * - AGENTS.md
 * - AGENT.md
 * - CLAUDE.md
 *
 * If a base instruction file is found, its corresponding .local.md variant is also
 * checked and appended when building the instruction set (useful for personal preferences not committed to git).
 *
 * @param metadata - Workspace metadata containing the workspace path
 * @param mode - Optional mode name (e.g., "plan", "exec") - looks for {MODE}.md files if provided
 * @param additionalSystemInstructions - Optional additional system instructions to append at the end
 * @returns System message string with all instruction sources combined
 * @throws Error if metadata is invalid or workspace path is missing
 */
export async function buildSystemMessage(
  metadata: WorkspaceMetadata,
  mode?: string,
  additionalSystemInstructions?: string
): Promise<string> {
  // Validate metadata early
  if (!metadata?.workspacePath) {
    throw new Error("Invalid workspace metadata: workspacePath is required");
  }

  const systemDir = getSystemDirectory();
  const workspaceDir = metadata.workspacePath;

  // Gather instruction sets from both global and workspace directories
  // Global instructions apply first, then workspace-specific ones
  const instructionDirectories = [systemDir, workspaceDir];
  const instructionSegments = await gatherInstructionSets(instructionDirectories);
  const customInstructions = instructionSegments.join("\n\n");

  // Look for a "Mode: <mode>" section inside instruction sets, preferring workspace over global
  let modeContent: string | null = null;
  if (mode) {
    const workspaceInstructions = await readInstructionSet(workspaceDir);
    if (workspaceInstructions) {
      modeContent = extractModeSection(workspaceInstructions, mode);
    }
    if (!modeContent) {
      const globalInstructions = await readInstructionSet(systemDir);
      if (globalInstructions) {
        modeContent = extractModeSection(globalInstructions, mode);
      }
    }
  }

  // Build the final system message
  const environmentContext = buildEnvironmentContext(workspaceDir);
  const trimmedPrelude = PRELUDE.trim();
  let systemMessage = `${trimmedPrelude}\n\n${environmentContext}`;

  // Add custom instructions if found
  if (customInstructions) {
    systemMessage += `\n<custom-instructions>\n${customInstructions}\n</custom-instructions>`;
  }

  // Add mode-specific content if found
  if (modeContent) {
    systemMessage += `\n\n<${mode}>\n${modeContent}\n</${mode}>`;
  }

  // Add additional system instructions at the end (highest priority)
  if (additionalSystemInstructions) {
    systemMessage += `\n\n<additional-instructions>\n${additionalSystemInstructions}\n</additional-instructions>`;
  }

  return systemMessage;
}
