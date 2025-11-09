import type { Runtime } from "@/runtime/Runtime";
import type { RuntimeConfig } from "./runtime";
import type { RpcTarget } from "capnweb";
import type {
  BashToolArgs,
  BashToolResult,
  FileReadToolArgs,
  FileReadToolResult,
  FileEditReplaceStringToolArgs,
  FileEditReplaceStringToolResult,
  FileEditReplaceLinesToolArgs,
  FileEditReplaceLinesToolResult,
  FileEditInsertToolArgs,
  FileEditInsertToolResult,
  ProposePlanToolArgs,
  ProposePlanToolResult,
  TodoWriteToolArgs,
  TodoWriteToolResult,
  StatusSetToolArgs,
  StatusSetToolResult,
} from "./tools";

/**
 * Extension manifest structure (manifest.json)
 */
export interface ExtensionManifest {
  entrypoint: string; // e.g., "index.js"
}

/**
 * Tool execution payload - discriminated union by tool name
 */
export type ToolUsePayload =
  | {
      toolName: "bash";
      toolCallId: string;
      args: BashToolArgs;
      result: BashToolResult;
      workspaceId: string;
      timestamp: number;
    }
  | {
      toolName: "file_read";
      toolCallId: string;
      args: FileReadToolArgs;
      result: FileReadToolResult;
      workspaceId: string;
      timestamp: number;
    }
  | {
      toolName: "file_edit_replace_string";
      toolCallId: string;
      args: FileEditReplaceStringToolArgs;
      result: FileEditReplaceStringToolResult;
      workspaceId: string;
      timestamp: number;
    }
  | {
      toolName: "file_edit_replace_lines";
      toolCallId: string;
      args: FileEditReplaceLinesToolArgs;
      result: FileEditReplaceLinesToolResult;
      workspaceId: string;
      timestamp: number;
    }
  | {
      toolName: "file_edit_insert";
      toolCallId: string;
      args: FileEditInsertToolArgs;
      result: FileEditInsertToolResult;
      workspaceId: string;
      timestamp: number;
    }
  | {
      toolName: "propose_plan";
      toolCallId: string;
      args: ProposePlanToolArgs;
      result: ProposePlanToolResult;
      workspaceId: string;
      timestamp: number;
    }
  | {
      toolName: "todo_write";
      toolCallId: string;
      args: TodoWriteToolArgs;
      result: TodoWriteToolResult;
      workspaceId: string;
      timestamp: number;
    }
  | {
      toolName: "status_set";
      toolCallId: string;
      args: StatusSetToolArgs;
      result: StatusSetToolResult;
      workspaceId: string;
      timestamp: number;
    }
  | {
      // Catch-all for unknown tools
      toolName: string;
      toolCallId: string;
      args: unknown;
      result: unknown;
      workspaceId: string;
      timestamp: number;
    };

/**
 * Hook payload for post-tool-use hook with Runtime access
 * This adds the runtime field to each variant of ToolUsePayload
 */
export type PostToolUseHookPayload = ToolUsePayload & {
  runtime: Runtime; // Extensions get full workspace access via Runtime
};

/**
 * Extension export interface - what extensions must export as default
 */
export interface Extension {
  /**
   * Hook called after a tool is executed.
   * Extensions can monitor, log, or modify the tool result.
   * 
   * @param payload - Tool execution context with full Runtime access
   * @returns The tool result (modified or unmodified). Return undefined to leave unchanged.
   */
  onPostToolUse?: (payload: PostToolUseHookPayload) => Promise<unknown> | unknown;
}

/**
 * Extension discovery result
 */
export interface ExtensionInfo {
  id: string; // Extension identifier - NOW: Full absolute path to extension
  path: string; // Absolute path to entrypoint file (same as id)
  type: "file" | "folder";
  source: "global" | "project"; // Where extension was discovered from
  projectPath?: string; // Set for project extensions
  entrypoint?: string; // Relative entrypoint (for folder extensions)
  needsCompilation?: boolean; // True for .ts files that need compilation
}

/**
 * RPC interface for extension host process.
 * Each extension host implements this interface and is called by the main process via capnweb RPC.
 */
export interface ExtensionHostApi extends RpcTarget {
  /**
   * Initialize the extension host with a single extension
   * @param extensionInfo Information about the extension to load
   */
  initialize(extensionInfo: ExtensionInfo): Promise<void>;

  /**
   * Register a workspace with this extension host
   */
  registerWorkspace(
    workspaceId: string,
    workspacePath: string,
    projectPath: string,
    runtimeConfig: RuntimeConfig,
    runtimeTempDir: string
  ): Promise<void>;

  /**
   * Unregister a workspace from this extension host
   */
  unregisterWorkspace(workspaceId: string): Promise<void>;

  /**
   * Dispatch post-tool-use hook to the extension
   * @param payload Hook payload (runtime will be added by host)
   * @returns The (possibly modified) tool result, or undefined if unchanged
   */
  onPostToolUse(payload: ToolUsePayload): Promise<unknown>;

  /**
   * Gracefully shutdown the extension host
   */
  shutdown(): Promise<void>;
}
