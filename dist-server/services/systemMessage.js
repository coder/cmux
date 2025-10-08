"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSystemMessage = buildSystemMessage;
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
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
function buildEnvironmentContext(workspacePath) {
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
 * @param additionalSystemInstructions - Optional additional system instructions to append at the end
 * @returns System message string (placeholder + custom instructions if found + additional instructions)
 * @throws Error if metadata is invalid or workspace path is missing
 */
async function buildSystemMessage(metadata, additionalSystemInstructions) {
    // Validate metadata early
    if (!metadata?.workspacePath) {
        throw new Error("Invalid workspace metadata: workspacePath is required");
    }
    const environmentContext = buildEnvironmentContext(metadata.workspacePath);
    let customInstructions = "";
    // Try to read custom instruction files in order
    for (const filename of CUSTOM_INSTRUCTION_FILES) {
        try {
            const filePath = path.join(metadata.workspacePath, filename);
            const content = await fs.readFile(filePath, "utf-8");
            customInstructions = content;
            break; // Use first found file
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        }
        catch (_error) {
            // File doesn't exist or can't be read, try next file
            continue;
        }
    }
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
//# sourceMappingURL=systemMessage.js.map