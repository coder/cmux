import * as os from "os";
import * as path from "path";
import type { WorkspaceMetadata } from "@/types/workspace";
import { readInstructionSet, INSTRUCTION_FILE_NAMES } from "@/utils/main/instructionFiles";
import { extractModeSection } from "@/utils/main/markdown";
import type { Runtime } from "@/runtime/Runtime";
import { readFileString } from "@/utils/runtime/helpers";

// NOTE: keep this in sync with the docs/models.md file

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
 * Read the first available file from a list using runtime.
 *
 * @param runtime - Runtime instance (may be local or SSH)
 * @param directory - Directory to search in
 * @param filenames - List of filenames to try, in priority order
 * @returns Content of the first file found, or null if none exist
 */
async function readFirstAvailableFileFromRuntime(
  runtime: Runtime,
  directory: string,
  filenames: readonly string[]
): Promise<string | null> {
  for (const filename of filenames) {
    try {
      const filePath = path.join(directory, filename);
      return await readFileString(runtime, filePath);
    } catch {
      // File doesn't exist or can't be read, try next
      continue;
    }
  }
  return null;
}

/**
 * Read a file with optional local variant using runtime.
 * Follows the same pattern as readFileWithLocalVariant but uses Runtime.
 *
 * @param runtime - Runtime instance (may be local or SSH)
 * @param directory - Directory to search
 * @param baseFilenames - Base filenames to try in priority order
 * @param localFilename - Optional local filename to append if present
 * @returns Combined content or null if no base file exists
 */
async function readFileWithLocalVariantFromRuntime(
  runtime: Runtime,
  directory: string,
  baseFilenames: readonly string[],
  localFilename?: string
): Promise<string | null> {
  const baseContent = await readFirstAvailableFileFromRuntime(runtime, directory, baseFilenames);

  if (!baseContent) {
    return null;
  }

  if (!localFilename) {
    return baseContent;
  }

  try {
    const localFilePath = path.join(directory, localFilename);
    const localContent = await readFileString(runtime, localFilePath);
    return `${baseContent}\n\n${localContent}`;
  } catch {
    return baseContent;
  }
}

/**
 * Read instruction set from a workspace using the runtime abstraction.
 * This supports both local workspaces and remote SSH workspaces.
 *
 * @param runtime - Runtime instance (may be local or SSH)
 * @param workspacePath - Path to workspace directory
 * @returns Combined instruction content, or null if no base file exists
 */
async function readInstructionSetFromRuntime(
  runtime: Runtime,
  workspacePath: string
): Promise<string | null> {
  const LOCAL_INSTRUCTION_FILENAME = "AGENTS.local.md";
  return readFileWithLocalVariantFromRuntime(
    runtime,
    workspacePath,
    INSTRUCTION_FILE_NAMES,
    LOCAL_INSTRUCTION_FILENAME
  );
}

/**
 * Builds a system message for the AI model by combining multiple instruction sources.
 *
 * Instruction sources are layered as follows:
 * 1. Global instructions: ~/.cmux/AGENTS.md (+ AGENTS.local.md) - always included
 * 2. Context instructions: EITHER workspace OR project AGENTS.md (not both)
 *    - Workspace: <workspacePath>/AGENTS.md (+ AGENTS.local.md) - if exists (read via runtime)
 *    - Project: <projectPath>/AGENTS.md (+ AGENTS.local.md) - fallback if workspace doesn't exist
 * 3. Mode-specific context (if mode provided): Extract a section titled "Mode: <mode>"
 *    (case-insensitive) from the instruction file. Priority: context instructions, then global.
 *
 * Each instruction file location is searched for in priority order:
 * - AGENTS.md
 * - AGENT.md
 * - CLAUDE.md
 *
 * If a base instruction file is found, its corresponding .local.md variant is also
 * checked and appended when building the instruction set (useful for personal preferences not committed to git).
 *
 * @param metadata - Workspace metadata (contains projectPath for reading AGENTS.md)
 * @param runtime - Runtime instance for reading workspace files (may be remote)
 * @param workspacePath - Absolute path to the workspace directory (for environment context)
 * @param mode - Optional mode name (e.g., "plan", "exec") - looks for {MODE}.md files if provided
 * @param additionalSystemInstructions - Optional additional system instructions to append at the end
 * @returns System message string with all instruction sources combined
 * @throws Error if metadata is invalid
 */
export async function buildSystemMessage(
  metadata: WorkspaceMetadata,
  runtime: Runtime,
  workspacePath: string,
  mode?: string,
  additionalSystemInstructions?: string
): Promise<string> {
  // Validate inputs
  if (!metadata) {
    throw new Error("Invalid workspace metadata: metadata is required");
  }
  if (!workspacePath) {
    throw new Error("Invalid workspace path: workspacePath is required");
  }

  const systemDir = getSystemDirectory();
  const projectDir = metadata.projectPath;

  // Layer 1: Global instructions (always included)
  const globalInstructions = await readInstructionSet(systemDir);

  // Layer 2: Workspace OR Project instructions (not both)
  // Try workspace first (via runtime, may be remote for SSH)
  // Fall back to project if workspace doesn't have AGENTS.md
  const workspaceInstructions = await readInstructionSetFromRuntime(runtime, workspacePath);
  const projectInstructions = workspaceInstructions ? null : await readInstructionSet(projectDir);

  // Combine instruction sources
  // Result: global + (workspace OR project)
  const instructionSegments = [
    globalInstructions,
    workspaceInstructions ?? projectInstructions,
  ].filter(Boolean);
  const customInstructions = instructionSegments.join("\n\n");

  // Look for a "Mode: <mode>" section inside instruction sets
  // Priority: workspace (or project fallback), then global
  // We only check the workspace OR project instructions, not both
  // This behavior is documented in docs/instruction-files.md - keep both in sync when changing.
  let modeContent: string | null = null;
  if (mode) {
    const contextInstructions = workspaceInstructions ?? projectInstructions;
    if (contextInstructions) {
      modeContent = extractModeSection(contextInstructions, mode);
    }
    if (!modeContent && globalInstructions) {
      modeContent = extractModeSection(globalInstructions, mode);
    }
  }

  // Build the final system message
  // Use workspacePath for environment context (where code actually executes)
  const environmentContext = buildEnvironmentContext(workspacePath);
  const trimmedPrelude = PRELUDE.trim();
  let systemMessage = `${trimmedPrelude}\n\n${environmentContext}`;

  // Add custom instructions if found
  if (customInstructions) {
    systemMessage += `\n<custom-instructions>\n${customInstructions}\n</custom-instructions>`;
  }

  // Add mode-specific content if found
  if (modeContent) {
    const tag = (mode ?? "mode").toLowerCase().replace(/[^a-z0-9_-]/gi, "-");
    systemMessage += `\n\n<${tag}>\n${modeContent}\n</${tag}>`;
  }

  // Add additional system instructions at the end (highest priority)
  if (additionalSystemInstructions) {
    systemMessage += `\n\n<additional-instructions>\n${additionalSystemInstructions}\n</additional-instructions>`;
  }

  return systemMessage;
}
