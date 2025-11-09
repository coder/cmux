import type { Runtime } from "@/runtime/Runtime";
import type { RuntimeConfig } from "./runtime";
import type { RpcTarget } from "capnweb";

/**
 * Extension manifest structure (manifest.json)
 */
export interface ExtensionManifest {
  entrypoint: string; // e.g., "index.js"
}

/**
 * Hook payload for post-tool-use hook
 */
export interface PostToolUseHookPayload {
  toolName: string;
  toolCallId: string;
  args: unknown;
  result: unknown;
  workspaceId: string;
  timestamp: number;
  runtime: Runtime; // Extensions get full workspace access via Runtime
}

/**
 * Extension export interface - what extensions must export as default
 */
export interface Extension {
  /**
   * Hook called after a tool is executed.
   * Extensions can monitor, log, or modify the tool result.
   * 
   * @param payload - Tool execution context with full Runtime access
   * @returns The tool result (can be modified) or undefined to leave unchanged
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
  onPostToolUse(payload: Omit<PostToolUseHookPayload, "runtime">): Promise<unknown>;

  /**
   * Gracefully shutdown the extension host
   */
  shutdown(): Promise<void>;
}
