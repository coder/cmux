/**
 * Extension Host Process
 *
 * This script runs as a separate Node.js process (spawned via fork()).
 * Each extension host loads a SINGLE extension and handles its lifecycle.
 * Communicates with main process via capnweb RPC over Node.js IPC.
 *
 * Architecture: One process per extension for isolation and crash safety.
 */

import { RpcTarget, RpcSession } from "capnweb";
import type { Runtime } from "../../runtime/Runtime";
import type { RuntimeConfig } from "../../types/runtime";
import type {
  Extension,
  ExtensionInfo,
  ExtensionHostApi,
  ToolUsePayload,
} from "../../types/extensions";
import { NodeIpcProcessTransport } from "./nodeIpcTransport";

/**
 * Implementation of the ExtensionHostApi RPC interface.
 * This is the main class that the parent process will call via RPC.
 */
class ExtensionHostImpl extends RpcTarget implements ExtensionHostApi {
  private extensionInfo: ExtensionInfo | null = null;
  private extensionModule: Extension | null = null;
  private workspaceRuntimes = new Map<string, Runtime>();

  /**
   * Initialize this extension host with a single extension
   */
  async initialize(extensionInfo: ExtensionInfo): Promise<void> {
    console.log(`[ExtensionHost] Initializing with extension: ${extensionInfo.id}`);

    this.extensionInfo = extensionInfo;

    try {
      let modulePath = extensionInfo.path;

      // Compile TypeScript extensions on-the-fly
      if (extensionInfo.needsCompilation) {
        // Dynamic import to avoid bundling compiler in main process
        // eslint-disable-next-line no-restricted-syntax -- Required in child process
        const { compileExtension } = await import("./compiler.js");
        modulePath = await compileExtension(extensionInfo.path);
      }

      // Dynamic import to load the extension module
      // Extensions must export a default object with hook handlers
      // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-unsafe-assignment -- Dynamic import required for user extensions
      const module = await import(modulePath);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- User-provided extension module
      if (!module.default) {
        throw new Error(`Extension ${extensionInfo.id} does not export a default object`);
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- User-provided extension module
      this.extensionModule = module.default as Extension;

      console.log(`[ExtensionHost] Successfully loaded extension: ${extensionInfo.id}`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ExtensionHost] Failed to load extension ${extensionInfo.id}:`, errorMsg);
      throw new Error(`Failed to load extension: ${errorMsg}`);
    }
  }

  /**
   * Register a workspace with this extension host
   */
  async registerWorkspace(
    workspaceId: string,
    workspacePath: string,
    projectPath: string,
    runtimeConfig: RuntimeConfig,
    runtimeTempDir: string
  ): Promise<void> {
    // Dynamically import createRuntime to avoid bundling issues
    // eslint-disable-next-line no-restricted-syntax -- Required in child process to avoid circular deps
    const { createRuntime } = await import("../../runtime/runtimeFactory");

    // Create runtime for this workspace
    const runtime = createRuntime(runtimeConfig);
    this.workspaceRuntimes.set(workspaceId, runtime);

    console.log(`[ExtensionHost] Registered workspace ${workspaceId}`);
  }

  /**
   * Unregister a workspace from this extension host
   */
  async unregisterWorkspace(workspaceId: string): Promise<void> {
    this.workspaceRuntimes.delete(workspaceId);
    console.log(`[ExtensionHost] Unregistered workspace ${workspaceId}`);
  }

  /**
   * Dispatch post-tool-use hook to the extension
   * @returns The (possibly modified) tool result, or undefined if unchanged
   */
  async onPostToolUse(payload: ToolUsePayload): Promise<unknown> {
    if (!this.extensionModule || !this.extensionModule.onPostToolUse) {
      // Extension doesn't have this hook - return result unchanged
      return payload.result;
    }

    // Get runtime for this workspace
    const runtime = this.workspaceRuntimes.get(payload.workspaceId);
    if (!runtime) {
      console.error(
        `[ExtensionHost] Runtime not found for workspace ${payload.workspaceId}, skipping hook`
      );
      return payload.result;
    }

    try {
      // Call the extension's hook handler with runtime access
      const modifiedResult = await this.extensionModule.onPostToolUse({
        ...payload,
        runtime,
      });
      
      // If extension returns undefined, use original result
      return modifiedResult !== undefined ? modifiedResult : payload.result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ExtensionHost] Extension threw error in onPostToolUse:`, errorMsg);
      // On error, return original result unchanged
      return payload.result;
    }
  }

  /**
   * Gracefully shutdown this extension host
   */
  async shutdown(): Promise<void> {
    console.log(`[ExtensionHost] Shutting down extension host for ${this.extensionInfo?.id}`);
    // Clean up resources
    this.workspaceRuntimes.clear();
    // Exit process
    process.exit(0);
  }
}

// ============================================================================
// Main Entry Point: Set up RPC and start extension host
// ============================================================================

// Get extension ID from command line arguments
const extensionId = process.argv[2];
if (!extensionId) {
  console.error("[ExtensionHost] ERROR: Extension ID not provided in arguments");
  process.exit(1);
}

console.log(`[ExtensionHost] Process started for extension: ${extensionId}`);

// Create RPC session
try {
  const transport = new NodeIpcProcessTransport(extensionId);
  const hostImpl = new ExtensionHostImpl();
  
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const session = new RpcSession(transport, hostImpl);

  console.log(`[ExtensionHost] RPC session established for ${extensionId}`);
} catch (error) {
  console.error("[ExtensionHost] Failed to set up RPC:", error);
  process.exit(1);
}

// Handle process errors
process.on("uncaughtException", (error) => {
  console.error(`[ExtensionHost:${extensionId}] Uncaught exception:`, error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error(`[ExtensionHost:${extensionId}] Unhandled rejection:`, reason);
  process.exit(1);
});
