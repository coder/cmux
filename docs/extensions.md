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
  /**
   * Hook called after a tool is executed.
   * Extensions can monitor, log, or modify the tool result.
   * 
   * @param payload - Tool execution context with full Runtime access
   * @returns The tool result (modified or unmodified). Return undefined to leave unchanged.
   */
  onPostToolUse?: (payload: PostToolUseHookPayload) => Promise<unknown> | unknown;
}

// PostToolUseHookPayload is a discriminated union by toolName
// Each tool has specific arg and result types:

type PostToolUseHookPayload =
  | {
      toolName: "bash";
      args: { script: string; timeout_secs?: number };
      result: { success: true; output: string; exitCode: 0; wall_duration_ms: number }
             | { success: false; output?: string; exitCode: number; error: string; wall_duration_ms: number };
      toolCallId: string;
      workspaceId: string;
      timestamp: number;
      runtime: Runtime;
    }
  | {
      toolName: "file_read";
      args: { filePath: string; offset?: number; limit?: number };
      result: { success: true; file_size: number; modifiedTime: string; lines_read: number; content: string }
             | { success: false; error: string };
      toolCallId: string;
      workspaceId: string;
      timestamp: number;
      runtime: Runtime;
    }
  | {
      toolName: "file_edit_replace_string";
      args: { file_path: string; old_string: string; new_string: string; replace_count?: number };
      result: { success: true; diff: string; edits_applied: number }
             | { success: false; error: string };
      toolCallId: string;
      workspaceId: string;
      timestamp: number;
      runtime: Runtime;
    }
  // ... other tools (file_edit_insert, propose_plan, todo_write, status_set, etc.)
  | {
      // Catch-all for unknown tools
      toolName: string;
      args: unknown;
      result: unknown;
      toolCallId: string;
      workspaceId: string;
      timestamp: number;
      runtime: Runtime;
    };
```

**Type safety**: When you check `payload.toolName`, TypeScript narrows the `args` and `result` types automatically:

```typescript
const extension: Extension = {
  async onPostToolUse(payload) {
    if (payload.toolName === "bash") {
      // TypeScript knows: payload.args is { script: string; timeout_secs?: number }
      // TypeScript knows: payload.result has { success, output?, error?, exitCode, wall_duration_ms }
      const command = payload.args.script;
      
      if (!payload.result.success) {
        const errorMsg = payload.result.error; // Type-safe access
      }
    }
    
    return payload.result;
  }
};
```

## Runtime API

Extensions receive a `runtime` object providing low-level access to the workspace:

```typescript
interface Runtime {
  /**
   * Execute a bash command with streaming I/O
   * @param command - Bash script to execute
   * @param options - Execution options (cwd, env, timeout, etc.)
   * @returns Streaming handles for stdin/stdout/stderr and exit code
   */
  exec(command: string, options: ExecOptions): Promise<ExecStream>;
  
  /**
   * Read file contents as a stream
   * @param path - Path to file (relative to workspace root)
   * @param abortSignal - Optional abort signal
   * @returns Readable stream of file contents
   */
  readFile(path: string, abortSignal?: AbortSignal): ReadableStream<Uint8Array>;
  
  /**
   * Write file contents from a stream
   * @param path - Path to file (relative to workspace root)
   * @param abortSignal - Optional abort signal
   * @returns Writable stream for file contents
   */
  writeFile(path: string, abortSignal?: AbortSignal): WritableStream<Uint8Array>;
  
  /**
   * Get file statistics
   * @param path - Path to file or directory
   * @param abortSignal - Optional abort signal
   * @returns File statistics (size, modified time, isDirectory)
   */
  stat(path: string, abortSignal?: AbortSignal): Promise<FileStat>;
  
  /**
   * Compute absolute workspace path
   * @param projectPath - Project root path
   * @param workspaceName - Workspace name
   * @returns Absolute path to workspace
   */
  getWorkspacePath(projectPath: string, workspaceName: string): string;
  
  /**
   * Normalize a path for comparison
   * @param targetPath - Path to normalize
   * @param basePath - Base path for relative resolution
   * @returns Normalized path
   */
  normalizePath(targetPath: string, basePath: string): string;
  
  /**
   * Resolve path to absolute, canonical form
   * @param path - Path to resolve (may contain ~ or be relative)
   * @returns Absolute path
   */
  resolvePath(path: string): Promise<string>;
}

interface ExecOptions {
  /** Working directory (usually "." for workspace root) */
  cwd: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in seconds (required) */
  timeout: number;
  /** Process niceness (-20 to 19) */
  niceness?: number;
  /** Abort signal */
  abortSignal?: AbortSignal;
}

interface ExecStream {
  stdout: ReadableStream<Uint8Array>;
  stderr: ReadableStream<Uint8Array>;
  stdin: WritableStream<Uint8Array>;
  exitCode: Promise<number>;
  duration: Promise<number>;
}

interface FileStat {
  size: number;
  modifiedTime: Date;
  isDirectory: boolean;
}
```

### Common Patterns

**Most extensions will use `runtime.exec()` for simplicity:**

```typescript
// Write file
await runtime.exec(`cat > file.txt << 'EOF'\ncontent here\nEOF`, { cwd: ".", timeout: 5 });

// Append to file
await runtime.exec(`echo "line" >> file.txt`, { cwd: ".", timeout: 5 });

// Read file
const result = await runtime.exec(`cat file.txt`, { cwd: ".", timeout: 5 });

// Check if file exists
const { exitCode } = await runtime.exec(`test -f file.txt`, { cwd: ".", timeout: 5 });
const exists = exitCode === 0;
```

All file paths are relative to the workspace root.

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
