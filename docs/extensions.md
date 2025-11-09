# Extensions

Extensions allow you to customize and extend cmux behavior by hooking into tool execution. Extensions can monitor, log, or modify tool results before they're sent to the AI.

## Quick Start

Create a TypeScript or JavaScript file in one of these locations:

- **Global**: `~/.cmux/ext/my-extension.ts` (applies to all workspaces)
- **Project**: `<project>/.cmux/ext/my-extension.ts` (applies only to that project's workspaces)

Example extension that logs all bash commands:

```typescript
// ~/.cmux/ext/bash-logger.ts
import type { Extension } from "@coder/cmux/ext";

const extension: Extension = {
  async onPostToolUse({ toolName, args, result, runtime, workspaceId }) {
    if (toolName === "bash") {
      const command = (args as any)?.script || "unknown";
      const logEntry = `[${new Date().toISOString()}] ${command}\n`;
      
      // Use exec to append to file
      await runtime.exec(
        `echo ${JSON.stringify(logEntry)} >> .cmux/bash-log.txt`,
        { cwd: ".", timeout: 5 }
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
  // Execute bash commands with streaming I/O
  exec(command: string, options: ExecOptions): Promise<ExecStream>;
  
  // File operations (streaming primitives)
  readFile(path: string, abortSignal?: AbortSignal): ReadableStream<Uint8Array>;
  writeFile(path: string, abortSignal?: AbortSignal): WritableStream<Uint8Array>;
  stat(path: string, abortSignal?: AbortSignal): Promise<FileStat>;
  
  // Path operations
  getWorkspacePath(projectPath: string, workspaceName: string): string;
  normalizePath(targetPath: string, basePath: string): string;
  resolvePath(path: string): Promise<string>;
  
  // Workspace operations
  createWorkspace(params: WorkspaceCreationParams): Promise<WorkspaceCreationResult>;
  initWorkspace(params: WorkspaceInitParams): Promise<WorkspaceInitResult>;
  deleteWorkspace(...): Promise<Result>;
  renameWorkspace(...): Promise<Result>;
  forkWorkspace(...): Promise<Result>;
}
```

**Most extensions will use `runtime.exec()` for file operations:**

```typescript
// Write file
await runtime.exec(`cat > file.txt << 'EOF'\ncontent here\nEOF`, { cwd: ".", timeout: 5 });

// Append to file
await runtime.exec(`echo "line" >> file.txt`, { cwd: ".", timeout: 5 });

// Read file
const result = await runtime.exec(`cat file.txt`, { cwd: ".", timeout: 5 });
```

All paths are relative to the workspace root.

## Modifying Tool Results

Extensions can modify tool results before they're sent to the AI:

```typescript
// ~/.cmux/ext/error-enhancer.ts
import type { Extension } from "@coder/cmux/ext";

const extension: Extension = {
  async onPostToolUse({ toolName, result, runtime }) {
    if (toolName === "bash" && result.success === false) {
      // Add helpful context to bash errors
      const enhanced = {
        ...result,
        error: result.error + "\n\nHint: Check .cmux/error-log.txt for details"
      };
      
      // Log the error using exec
      const logEntry = `[${new Date().toISOString()}] ${result.error}`;
      await runtime.exec(
        `echo ${JSON.stringify(logEntry)} >> .cmux/error-log.txt`,
        { cwd: ".", timeout: 5 }
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
import type { Extension, PostToolUseHookPayload, Runtime } from "@coder/cmux/ext";
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
import type { Extension } from "@coder/cmux/ext";

const extension: Extension = {
  async onPostToolUse({ toolName, args, runtime, timestamp, result }) {
    if (toolName === "file_edit_replace_string" || toolName === "file_edit_insert") {
      const filePath = (args as any)?.file_path || "unknown";
      const logEntry = `${new Date(timestamp).toISOString()}: ${toolName} on ${filePath}`;
      
      await runtime.exec(
        `echo ${JSON.stringify(logEntry)} >> .cmux/edit-history.txt`,
        { cwd: ".", timeout: 5 }
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
import type { Extension } from "@coder/cmux/ext";

const extension: Extension = {
  async onPostToolUse({ toolName, args, runtime, result }) {
    if (toolName === "file_edit_replace_string" || toolName === "file_edit_insert") {
      const filePath = (args as any)?.file_path;
      
      if (filePath && filePath.endsWith(".ts")) {
        // Run prettier on the edited file
        await runtime.exec(`bun x prettier --write ${filePath}`, {
          cwd: ".",
          timeout: 30
        });
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
