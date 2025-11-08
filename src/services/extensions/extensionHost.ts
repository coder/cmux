/**
 * Extension Host Process
 *
 * This script runs as a separate Node.js process (spawned via fork()).
 * It receives IPC messages from the main cmux process, loads extensions once,
 * maintains a map of workspace runtimes, and dispatches hooks to extensions.
 *
 * A single shared extension host serves all workspaces (VS Code architecture).
 */

import type { Runtime } from "../../runtime/Runtime";
import type {
  Extension,
  ExtensionHostMessage,
  ExtensionHostResponse,
  ExtensionInfo,
} from "../../types/extensions";

const workspaceRuntimes = new Map<string, Runtime>();
const extensions: Array<{ id: string; module: Extension }> = [];

/**
 * Send a message to the parent process
 */
function sendMessage(message: ExtensionHostResponse): void {
  if (process.send) {
    process.send(message);
  }
}

/**
 * Load an extension from its entrypoint path
 */
async function loadExtension(extInfo: ExtensionInfo): Promise<void> {
  try {
    // Dynamic import to load the extension module
    // Extensions must export a default object with hook handlers
    // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-unsafe-assignment -- Dynamic import required for user extensions
    const module = await import(extInfo.path);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- User-provided extension module
    if (!module.default) {
      throw new Error(`Extension ${extInfo.id} does not export a default object`);
    }

    extensions.push({
      id: extInfo.id,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access -- User-provided extension module
      module: module.default as Extension,
    });

    console.log(`[ExtensionHost] Loaded extension: ${extInfo.id}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`[ExtensionHost] Failed to load extension ${extInfo.id}:`, errorMsg);
    sendMessage({
      type: "extension-load-error",
      id: extInfo.id,
      error: errorMsg,
    });
  }
}

/**
 * Initialize the extension host (load extensions globally)
 */
async function handleInit(msg: Extract<ExtensionHostMessage, { type: "init" }>): Promise<void> {
  try {
    const { extensions: extensionList } = msg;

    console.log(`[ExtensionHost] Initializing with ${extensionList.length} extension(s)`);

    // Load all extensions once
    for (const extInfo of extensionList) {
      await loadExtension(extInfo);
    }

    // Send ready message
    sendMessage({
      type: "ready",
      extensionCount: extensions.length,
    });

    console.log(`[ExtensionHost] Ready with ${extensions.length} loaded extension(s)`);
  } catch (error) {
    console.error("[ExtensionHost] Failed to initialize:", error);
    process.exit(1);
  }
}

/**
 * Register a workspace with the extension host
 */
async function handleRegisterWorkspace(
  msg: Extract<ExtensionHostMessage, { type: "register-workspace" }>
): Promise<void> {
  try {
    const { workspaceId, runtimeConfig } = msg;

    // Dynamically import createRuntime to avoid bundling issues
    // eslint-disable-next-line no-restricted-syntax -- Required in child process to avoid circular deps
    const { createRuntime } = await import("../../runtime/runtimeFactory");

    // Create runtime for this workspace
    const runtime = createRuntime(runtimeConfig);
    workspaceRuntimes.set(workspaceId, runtime);

    console.log(`[ExtensionHost] Registered workspace ${workspaceId}`);

    // Send confirmation
    sendMessage({
      type: "workspace-registered",
      workspaceId,
    });
  } catch (error) {
    console.error(`[ExtensionHost] Failed to register workspace:`, error);
  }
}

/**
 * Unregister a workspace from the extension host
 */
function handleUnregisterWorkspace(
  msg: Extract<ExtensionHostMessage, { type: "unregister-workspace" }>
): void {
  const { workspaceId } = msg;

  workspaceRuntimes.delete(workspaceId);
  console.log(`[ExtensionHost] Unregistered workspace ${workspaceId}`);

  sendMessage({
    type: "workspace-unregistered",
    workspaceId,
  });
}

/**
 * Dispatch post-tool-use hook to all extensions
 */
async function handlePostToolUse(
  msg: Extract<ExtensionHostMessage, { type: "post-tool-use" }>
): Promise<void> {
  const { payload } = msg;

  // Get runtime for this workspace
  const runtime = workspaceRuntimes.get(payload.workspaceId);
  if (!runtime) {
    console.warn(
      `[ExtensionHost] Runtime not found for workspace ${payload.workspaceId}, skipping hook`
    );
    sendMessage({
      type: "hook-complete",
      hookType: "post-tool-use",
    });
    return;
  }

  // Dispatch to all extensions sequentially
  for (const { id, module } of extensions) {
    if (!module.onPostToolUse) {
      continue;
    }

    try {
      // Call the extension's hook handler with runtime access
      await module.onPostToolUse({
        ...payload,
        runtime,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[ExtensionHost] Extension ${id} threw error in onPostToolUse:`, errorMsg);
      sendMessage({
        type: "extension-error",
        extensionId: id,
        error: errorMsg,
      });
    }
  }

  // Acknowledge completion
  sendMessage({
    type: "hook-complete",
    hookType: "post-tool-use",
  });
}

/**
 * Handle shutdown request
 */
function handleShutdown(): void {
  console.log("[ExtensionHost] Shutting down");
  process.exit(0);
}

/**
 * Main message handler
 */
process.on("message", (msg: ExtensionHostMessage) => {
  void (async () => {
    try {
      switch (msg.type) {
        case "init":
          await handleInit(msg);
          break;
        case "register-workspace":
          await handleRegisterWorkspace(msg);
          break;
        case "unregister-workspace":
          handleUnregisterWorkspace(msg);
          break;
        case "post-tool-use":
          await handlePostToolUse(msg);
          break;
        case "shutdown":
          handleShutdown();
          break;
        default:
          console.warn(`[ExtensionHost] Unknown message type:`, msg);
      }
    } catch (error) {
      console.error("[ExtensionHost] Error handling message:", error);
    }
  })();
});

// Handle process errors
process.on("uncaughtException", (error) => {
  console.error("[ExtensionHost] Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[ExtensionHost] Unhandled rejection:", reason);
  process.exit(1);
});

console.log("[ExtensionHost] Process started, waiting for init message");
