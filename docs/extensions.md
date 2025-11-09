# Extensions

Extensions allow you to customize and extend cmux behavior by hooking into tool execution. Extensions can monitor, log, or modify tool results before they're sent to the AI.

## Quick Start

Create a TypeScript or JavaScript file in one of these locations:

- **Global**: `~/.cmux/ext/my-extension.ts` (applies to all workspaces)
- **Project**: `<project>/.cmux/ext/my-extension.ts` (applies only to that project's workspaces)

Example extension that logs all bash commands:

```typescript
// ~/.cmux/ext/bash-logger.ts
import type { Extension } from "cmux";

const extension: Extension = {
  async onPostToolUse({ toolName, args, result, runtime, workspaceId }) {
    if (toolName === "bash") {
      const command = (args as any)?.script || "unknown";
      await runtime.writeFile(
        ".cmux/bash-log.txt",
        `[${new Date().toISOString()}] ${command}\n`,
        { mode: "append" }
      );
    }
    // Return result unmodified
    return result;
  },
};

export default extension;
```

Extensions are automatically discovered and loaded when cmux starts.

## Architecture

- **One process per extension**: Each extension runs in its own isolated Node.js process
- **Crash isolation**: If one extension crashes, others continue running
- **Workspace filtering**: Project extensions only receive events from their project's workspaces
- **Type-safe RPC**: Communication uses capnweb RPC for type safety

## Extension Interface

```typescript
interface Extension {
  onPostToolUse?: (payload: PostToolUseHookPayload) => Promise<unknown> | unknown;
}

interface PostToolUseHookPayload {
  toolName: string;        // e.g., "bash", "file_edit"
  toolCallId: string;      // Unique ID for this tool invocation
  args: unknown;           // Tool arguments
  result: unknown;         // Tool result (can be modified)
  workspaceId: string;     // Workspace identifier
  timestamp: number;       // Unix timestamp (ms)
  runtime: Runtime;        // Full workspace runtime access
}
```

## Runtime API

Extensions receive a `runtime` object with full workspace access:

```typescript
interface Runtime {
  // File operations
  writeFile(path: string, content: string, options?: { mode?: "write" | "append" }): Promise<void>;
  readFile(path: string): Promise<string>;
  
  // Shell execution
  bash(command: string): Promise<{ success: boolean; output?: string; error?: string }>;
  
  // Workspace info
  workspaceId: string;
  workspacePath: string;
  projectPath: string;
}
```

All file paths are relative to the workspace root.

## Modifying Tool Results

Extensions can modify tool results before they're sent to the AI:

```typescript
// ~/.cmux/ext/error-enhancer.ts
const extension: Extension = {
  async onPostToolUse({ toolName, result, runtime }) {
    if (toolName === "bash" && result.success === false) {
      // Add helpful context to bash errors
      const enhanced = {
        ...result,
        error: result.error + "\n\nHint: Check .cmux/error-log.txt for details"
      };
      
      // Log the error
      await runtime.writeFile(
        ".cmux/error-log.txt",
        `[${new Date().toISOString()}] ${result.error}\n`,
        { mode: "append" }
      );
      
      return enhanced;
    }
    
    return result;
  },
};

export default extension;
```

## Folder-Based Extensions

For complex extensions, use a folder with a manifest:

```
~/.cmux/ext/my-extension/
├── manifest.json
├── index.ts
└── utils.ts
```

`manifest.json`:
```json
{
  "entrypoint": "index.ts"
}
```

`index.ts`:
```typescript
import type { Extension } from "cmux";
import { processToolResult } from "./utils";

const extension: Extension = {
  async onPostToolUse(payload) {
    return processToolResult(payload);
  },
};

export default extension;
```

## TypeScript Support

TypeScript extensions are automatically compiled when loaded. No build step required.

Import types from cmux:

```typescript
import type { Extension, PostToolUseHookPayload, Runtime } from "cmux";
```

## Global vs Project Extensions

**Global extensions** (`~/.cmux/ext/`):
- See events from ALL workspaces
- Useful for logging, metrics, global policies
- Example: Logging all commands to a central database

**Project extensions** (`<project>/.cmux/ext/`):
- Only see events from that project's workspaces  
- Useful for project-specific workflows
- Example: Auto-formatting code on file edits

## Extension Discovery

Extensions are loaded from:

1. `~/.cmux/ext/` (global extensions directory)
2. `<project>/.cmux/ext/` (project-specific extensions)

Both file and folder extensions are supported:
- Files: `my-extension.ts`, `my-extension.js`
- Folders: `my-extension/` (must have `manifest.json`)

## Example: Git Commit Logger

Log all file edits to track what's being changed:

```typescript
// <project>/.cmux/ext/edit-tracker.ts
import type { Extension } from "cmux";

const extension: Extension = {
  async onPostToolUse({ toolName, args, runtime, timestamp }) {
    if (toolName === "file_edit_replace_string" || toolName === "file_edit_insert") {
      const filePath = (args as any)?.file_path || "unknown";
      const logEntry = `${new Date(timestamp).toISOString()}: ${toolName} on ${filePath}\n`;
      
      await runtime.writeFile(
        ".cmux/edit-history.txt",
        logEntry,
        { mode: "append" }
      );
    }
    
    return result;
  },
};

export default extension;
```

## Example: Auto-Format on Edit

Automatically format files after edits:

```typescript
// <project>/.cmux/ext/auto-format.ts
import type { Extension } from "cmux";

const extension: Extension = {
  async onPostToolUse({ toolName, args, runtime, result }) {
    if (toolName === "file_edit_replace_string" || toolName === "file_edit_insert") {
      const filePath = (args as any)?.file_path;
      
      if (filePath && filePath.endsWith(".ts")) {
        // Run prettier on the edited file
        await runtime.bash(`bun x prettier --write ${filePath}`);
      }
    }
    
    return result;
  },
};

export default extension;
```

## Debugging

Extensions log to the main cmux console. Check the logs for:
- Extension discovery: "Loaded extension X from Y"
- Host spawning: "Spawning extension host for X"
- Errors: Extension crashes are logged but don't affect other extensions

To see debug output, set `CMUX_DEBUG=1` when starting cmux.

## Limitations

- Extensions cannot modify tool arguments (only results)
- Extensions run after tools complete (not before)
- Extensions cannot block tool execution
- Extension errors are logged but don't fail the tool call

## Performance

- Extensions run in parallel (not sequential)
- Individual extension failures don't block others
- Extensions receive events asynchronously after tool completion

## Security

- Extensions have full workspace access via Runtime
- Be cautious with global extensions from untrusted sources
- Project extensions are isolated to their project only
