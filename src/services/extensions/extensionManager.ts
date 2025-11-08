/**
 * Extension Manager
 *
 * Manages a single shared extension host process for all workspaces.
 * - Discovers extensions from global directory (~/.cmux/ext)
 * - Spawns extension host once at application startup
 * - Registers/unregisters workspaces with the host
 * - Forwards hook events to extension host via IPC
 * - Handles extension host crashes and errors
 */

import { fork } from "child_process";
import type { ChildProcess } from "child_process";
import * as path from "path";
import * as os from "os";
import type { WorkspaceMetadata } from "@/types/workspace";
import type { RuntimeConfig } from "@/types/runtime";
import type {
  ExtensionHostMessage,
  ExtensionHostResponse,
  PostToolUseHookPayload,
} from "@/types/extensions";
import { discoverExtensions } from "@/utils/extensions/discovery";
import { createRuntime } from "@/runtime/runtimeFactory";
import { log } from "@/services/log";

/**
 * Extension manager for handling a single global extension host
 */
export class ExtensionManager {
  private host: ChildProcess | null = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;
  private registeredWorkspaces = new Set<string>();

  /**
   * Initialize the global extension host (call once at application startup)
   *
   * Discovers extensions from global directory (~/.cmux/ext), spawns the
   * extension host process, and waits for it to be ready.
   *
   * If no extensions are found, this method returns immediately without spawning a host.
   * If already initialized or initializing, returns the existing promise.
   */
  async initializeGlobal(): Promise<void> {
    // If already initialized or initializing, return existing promise
    if (this.host) {
      return Promise.resolve();
    }
    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    this.isInitializing = true;

    this.initPromise = (async () => {
      try {
        // Discover extensions from global directory only
        const globalExtDir = path.join(os.homedir(), ".cmux", "ext");
        const extensions = await discoverExtensions(globalExtDir);

        if (extensions.length === 0) {
          log.debug("No global extensions found, skipping extension host");
          return;
        }

        log.info(`Found ${extensions.length} global extension(s), spawning extension host`);

        // Spawn the global extension host
        await this.spawnExtensionHost(extensions);
      } finally {
        this.isInitializing = false;
      }
    })();

    return this.initPromise;
  }

  /**
   * Register a workspace with the extension host
   *
   * Creates a runtime for the workspace and sends registration message to the host.
   * If the host is not initialized, this is a no-op.
   *
   * @param workspaceId - Unique identifier for the workspace
   * @param workspace - Workspace metadata containing project path and name
   * @param runtimeConfig - Runtime configuration (local or SSH)
   * @param runtimeTempDir - Temporary directory for runtime operations
   */
  async registerWorkspace(
    workspaceId: string,
    workspace: WorkspaceMetadata,
    runtimeConfig: RuntimeConfig,
    runtimeTempDir: string
  ): Promise<void> {
    if (!this.host) {
      log.debug(`Extension host not initialized, skipping workspace registration`);
      return;
    }

    if (this.registeredWorkspaces.has(workspaceId)) {
      log.debug(`Workspace ${workspaceId} already registered`);
      return;
    }

    // Compute workspace path from runtime
    const runtime = createRuntime(runtimeConfig);
    const workspacePath = runtime.getWorkspacePath(workspace.projectPath, workspace.name);

    const message: ExtensionHostMessage = {
      type: "register-workspace",
      workspaceId,
      workspacePath,
      projectPath: workspace.projectPath,
      runtimeConfig,
      runtimeTempDir,
    };

    this.host.send(message);

    // Wait for confirmation
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        log.error(`Workspace registration timeout for ${workspaceId}`);
        resolve();
      }, 5000);

      const handler = (msg: ExtensionHostResponse) => {
        if (msg.type === "workspace-registered" && msg.workspaceId === workspaceId) {
          clearTimeout(timeout);
          this.host?.off("message", handler);
          this.registeredWorkspaces.add(workspaceId);
          log.info(`Registered workspace ${workspaceId} with extension host`);
          resolve();
        }
      };

      this.host?.on("message", handler);
    });
  }

  /**
   * Unregister a workspace from the extension host
   *
   * Removes the workspace's runtime from the extension host.
   * Safe to call even if workspace is not registered (no-op).
   *
   * @param workspaceId - Unique identifier for the workspace
   */
  async unregisterWorkspace(workspaceId: string): Promise<void> {
    if (!this.host || !this.registeredWorkspaces.has(workspaceId)) {
      return;
    }

    const message: ExtensionHostMessage = {
      type: "unregister-workspace",
      workspaceId,
    };

    this.host.send(message);

    // Wait for confirmation
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        log.error(`Workspace unregistration timeout for ${workspaceId}`);
        resolve();
      }, 2000);

      const handler = (msg: ExtensionHostResponse) => {
        if (msg.type === "workspace-unregistered" && msg.workspaceId === workspaceId) {
          clearTimeout(timeout);
          this.host?.off("message", handler);
          this.registeredWorkspaces.delete(workspaceId);
          log.info(`Unregistered workspace ${workspaceId} from extension host`);
          resolve();
        }
      };

      this.host?.on("message", handler);
    });
  }

  /**
   * Spawn and initialize the global extension host process
   */
  private async spawnExtensionHost(
    extensions: Awaited<ReturnType<typeof discoverExtensions>>
  ): Promise<void> {
    // Path to extension host script (compiled to dist/)
    const hostPath = path.join(__dirname, "extensionHost.js");

    log.info(`Spawning global extension host with ${extensions.length} extension(s)`);

    // Spawn extension host process
    const host = fork(hostPath, {
      serialization: "json",
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });

    // Forward stdout/stderr to main process logs
    host.stdout?.on("data", (data: Buffer) => {
      const output = data.toString().trim();
      if (output) {
        log.debug(`[ExtensionHost] ${output}`);
      }
    });

    host.stderr?.on("data", (data: Buffer) => {
      const output = data.toString().trim();
      if (output) {
        log.error(`[ExtensionHost] ${output}`);
      }
    });

    // Handle host errors
    host.on("error", (error) => {
      log.error(`Extension host error:`, error);
      this.host = null;
      this.registeredWorkspaces.clear();
    });

    host.on("exit", (code, signal) => {
      log.error(`Extension host exited: code=${code ?? "null"} signal=${signal ?? "null"}`);
      this.host = null;
      this.registeredWorkspaces.clear();
    });

    // Listen for extension errors
    host.on("message", (msg: ExtensionHostResponse) => {
      if (msg.type === "extension-error") {
        log.error(`Extension ${msg.extensionId} error: ${msg.error}`);
      } else if (msg.type === "extension-load-error") {
        log.error(`Failed to load extension ${msg.id}: ${msg.error}`);
      }
    });

    // Wait for host to be ready
    const readyPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        host.kill();
        reject(new Error("Extension host initialization timeout (10s)"));
      }, 10000);

      const readyHandler = (msg: ExtensionHostResponse) => {
        if (msg.type === "ready") {
          clearTimeout(timeout);
          host.off("message", readyHandler);
          log.info(`Global extension host ready with ${msg.extensionCount} extension(s)`);
          resolve();
        }
      };

      host.on("message", readyHandler);
    });

    // Send initialization message
    const initMessage: ExtensionHostMessage = {
      type: "init",
      extensions,
    };

    host.send(initMessage);

    // Wait for ready confirmation
    await readyPromise;

    // Store host
    this.host = host;
  }

  /**
   * Send post-tool-use hook to extension host
   *
   * Called after a tool execution completes. Forwards the hook to all loaded
   * extensions, providing them with tool details and runtime access for the workspace.
   *
   * If no extension host is initialized, this returns immediately.
   * Waits up to 5 seconds for extensions to complete, then continues (non-blocking failure).
   *
   * @param workspaceId - Unique identifier for the workspace (must be registered)
   * @param payload - Hook payload containing tool name, args, result, etc. (runtime will be injected by host)
   */
  async postToolUse(
    workspaceId: string,
    payload: Omit<PostToolUseHookPayload, "runtime">
  ): Promise<void> {
    if (!this.host) {
      // No extensions loaded
      return;
    }

    const message: ExtensionHostMessage = {
      type: "post-tool-use",
      payload,
    };

    this.host.send(message);

    // Wait for completion (with timeout)
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        log.error(`Extension hook timeout for ${workspaceId} (tool: ${payload.toolName})`);
        resolve(); // Don't fail on timeout, just log and continue
      }, 5000);

      const handler = (msg: ExtensionHostResponse) => {
        if (msg.type === "hook-complete" && msg.hookType === "post-tool-use") {
          clearTimeout(timeout);
          this.host?.off("message", handler);
          resolve();
        }
      };

      this.host?.on("message", handler);
    });
  }

  /**
   * Shutdown the global extension host
   *
   * Sends shutdown message to the host and waits 1 second for graceful shutdown
   * before forcefully killing the process.
   *
   * Safe to call even if no host exists (no-op).
   */
  shutdown(): void {
    if (this.host) {
      const shutdownMessage: ExtensionHostMessage = { type: "shutdown" };
      this.host.send(shutdownMessage);

      // Give it a second to shutdown gracefully, then kill
      setTimeout(() => {
        if (this.host && !this.host.killed) {
          this.host.kill();
        }
      }, 1000);

      this.host = null;
      this.registeredWorkspaces.clear();
      log.info(`Shut down global extension host`);
    }
  }
}
