/**
 * Extension Manager
 *
 * Manages one extension host process per extension for isolation and filtering.
 * - Discovers extensions from global (~/.cmux/ext) and project (.cmux/ext) directories
 * - Spawns separate host process for each extension
 * - Registers/unregisters workspaces with appropriate hosts (with filtering)
 * - Forwards hook events to filtered extension hosts via RPC
 * - Handles extension host crashes and errors independently
 */

import { fork } from "child_process";
import type { ChildProcess } from "child_process";
import * as path from "path";
import * as os from "os";
import { promises as fs } from "fs";
import type { WorkspaceMetadata } from "@/types/workspace";
import type { RuntimeConfig } from "@/types/runtime";
import type {
  PostToolUseHookPayload,
  ExtensionInfo,
  ExtensionHostApi,
} from "@/types/extensions";
import { discoverExtensionsWithPrecedence } from "@/utils/extensions/discovery";
import { createRuntime } from "@/runtime/runtimeFactory";
import { log } from "@/services/log";
import { NodeIpcTransport } from "./nodeIpcTransport";
import { RpcSession, type RpcStub } from "capnweb";

/**
 * Information about a running extension host
 */
interface ExtensionHostInfo {
  process: ChildProcess;
  rpc: RpcStub<ExtensionHostApi>;
  transport: NodeIpcTransport;
  extensionInfo: ExtensionInfo;
  registeredWorkspaces: Set<string>;
}

/**
 * Extension manager for handling multiple extension host processes
 */
export class ExtensionManager {
  private hosts = new Map<string, ExtensionHostInfo>(); // Key: extension ID (full path)
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;
  // Track workspace metadata for extension discovery, reload, and filtering
  private workspaceMetadata = new Map<
    string,
    { workspace: WorkspaceMetadata; runtimeConfig: RuntimeConfig; runtimeTempDir: string }
  >();

  /**
   * Initialize extension hosts (call once at application startup)
   *
   * Discovers extensions from global and project directories, spawns one
   * host process per extension, and waits for them to be ready.
   *
   * If no extensions are found, this method returns immediately.
   * If already initialized or initializing, returns the existing promise.
   */
  async initializeGlobal(): Promise<void> {
    // If already initializing, return existing promise
    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    // If already initialized with hosts, return
    if (this.hosts.size > 0) {
      return Promise.resolve();
    }

    this.isInitializing = true;

    this.initPromise = (async () => {
      try {
        await this.discoverAndLoad();
      } finally {
        this.isInitializing = false;
      }
    })();

    return this.initPromise;
  }

  /**
   * Discover extensions from global + project directories and spawn their host processes.
   * Each extension gets its own isolated host process.
   */
  private async discoverAndLoad(): Promise<void> {
    // Build list of directories to scan
    const dirs: Array<{ path: string; source: "global" | "project"; projectPath?: string }> = [];

    // 1. Project directories from registered workspaces
    const uniqueProjects = new Set<string>();
    for (const { workspace } of this.workspaceMetadata.values()) {
      uniqueProjects.add(workspace.projectPath);
    }

    for (const projectPath of uniqueProjects) {
      const projectExtDir = path.join(projectPath, ".cmux", "ext");
      dirs.push({ path: projectExtDir, source: "project", projectPath });
    }

    // 2. Global directory
    const globalExtDir = path.join(os.homedir(), ".cmux", "ext");
    dirs.push({ path: globalExtDir, source: "global" });

    // Discover all extensions (full paths as IDs, so no duplicates)
    const extensions = await discoverExtensionsWithPrecedence(dirs);

    if (extensions.length === 0) {
      log.info("No extensions found, no extension hosts to spawn");
      return;
    }

    log.info(`Found ${extensions.length} extension(s), spawning host processes`);

    // Spawn one host per extension (in parallel for faster startup)
    await Promise.allSettled(
      extensions.map((ext) => this.spawnExtensionHost(ext))
    );

    log.info(`Extension hosts ready: ${this.hosts.size}/${extensions.length} successful`);
  }

  /**
   * Spawn a single extension host process and establish RPC connection
   */
  private async spawnExtensionHost(extensionInfo: ExtensionInfo): Promise<void> {
    // In production, __dirname points to dist/services/extensions
    // In tests (ts-jest), __dirname points to src/services/extensions
    // Try both locations to support both environments
    let hostPath = path.join(__dirname, "extensionHost.js");
    try {
      await fs.access(hostPath);
    } catch {
      // If not found, try the dist directory (for test environment)
      const distPath = path.join(__dirname, "..", "..", "..", "dist", "services", "extensions", "extensionHost.js");
      hostPath = distPath;
    }

    log.info(`Spawning extension host for ${extensionInfo.id}`);

    try {
      // Fork the extension host process, passing extension ID as argument
      const childProc = fork(hostPath, [extensionInfo.id], {
        serialization: "json",
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });

      // Forward stdout/stderr to main process logs
      childProc.stdout?.on("data", (data: Buffer) => {
        const output = data.toString().trim();
        if (output) {
          log.debug(`[ExtensionHost:${extensionInfo.id}] ${output}`);
        }
      });

      childProc.stderr?.on("data", (data: Buffer) => {
        const output = data.toString().trim();
        if (output) {
          log.error(`[ExtensionHost:${extensionInfo.id}] ${output}`);
        }
      });

      // Set up capnweb RPC over IPC
      const transport = new NodeIpcTransport(childProc, extensionInfo.id);
      const session = new RpcSession<ExtensionHostApi>(transport);
      const rpc = session.getRemoteMain();

      // Initialize the extension host with its extension
      await rpc.initialize(extensionInfo);

      // Store host info
      const hostInfo: ExtensionHostInfo = {
        process: childProc,
        rpc,
        transport,
        extensionInfo,
        registeredWorkspaces: new Set(),
      };

      this.hosts.set(extensionInfo.id, hostInfo);

      // Handle process exit/crash
      childProc.on("exit", (code, signal) => {
        log.error(
          `Extension host ${extensionInfo.id} exited: ` +
          `code=${code ?? "null"} signal=${signal ?? "null"}`
        );
        this.hosts.delete(extensionInfo.id);
        transport.dispose();
      });

      childProc.on("error", (error) => {
        log.error(`Extension host ${extensionInfo.id} error:`, error);
        this.hosts.delete(extensionInfo.id);
        transport.dispose();
      });

      log.info(`Extension host ready: ${extensionInfo.id}`);
    } catch (error) {
      log.error(`Failed to spawn extension host for ${extensionInfo.id}:`, error);
      throw error;
    }
  }

  /**
   * Determine if an extension host should see a workspace based on filtering rules:
   * - Global extensions see all workspaces
   * - Project extensions only see workspaces from their own project
   */
  private shouldHostSeeWorkspace(extensionInfo: ExtensionInfo, workspace: WorkspaceMetadata): boolean {
    if (extensionInfo.source === "global") {
      return true; // Global extensions see everything
    }

    // Project extension: only see workspaces from same project
    return extensionInfo.projectPath === workspace.projectPath;
  }

  /**
   * Register a workspace with appropriate extension hosts (with filtering)
   *
   * Registers the workspace with all extension hosts that should see it based on filtering rules.
   * Stores workspace metadata for extension discovery and future operations.
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
    if (this.hosts.size === 0) {
      log.debug(`No extension hosts initialized, skipping workspace registration`);
      return;
    }

    // Store workspace metadata
    this.workspaceMetadata.set(workspaceId, { workspace, runtimeConfig, runtimeTempDir });

    // Compute workspace path from runtime
    const runtime = createRuntime(runtimeConfig);
    const workspacePath = runtime.getWorkspacePath(workspace.projectPath, workspace.name);

    // Register with filtered hosts
    const registrations: Promise<void>[] = [];
    for (const [extId, hostInfo] of this.hosts) {
      // Apply workspace filtering
      if (!this.shouldHostSeeWorkspace(hostInfo.extensionInfo, workspace)) {
        log.debug(
          `Skipping workspace ${workspaceId} for extension ${extId} ` +
          `(project extension, different project)`
        );
        continue;
      }

      // Register workspace with this host
      const registration = (async () => {
        try {
          await hostInfo.rpc.registerWorkspace(
            workspaceId,
            workspacePath,
            workspace.projectPath,
            runtimeConfig,
            runtimeTempDir
          );
          hostInfo.registeredWorkspaces.add(workspaceId);
          log.info(`Registered workspace ${workspaceId} with extension ${extId}`);
        } catch (error) {
          log.error(`Failed to register workspace ${workspaceId} with extension ${extId}:`, error);
        }
      })();

      registrations.push(registration);
    }

    // Wait for all registrations to complete
    await Promise.allSettled(registrations);
  }

  /**
   * Unregister a workspace from all extension hosts
   *
   * Removes the workspace from all hosts that have it registered.
   * Safe to call even if workspace is not registered (no-op).
   *
   * @param workspaceId - Unique identifier for the workspace
   */
  async unregisterWorkspace(workspaceId: string): Promise<void> {
    const unregistrations: Promise<void>[] = [];

    for (const [extId, hostInfo] of this.hosts) {
      if (!hostInfo.registeredWorkspaces.has(workspaceId)) {
        continue; // Not registered with this host
      }

      const unregistration = (async () => {
        try {
          await hostInfo.rpc.unregisterWorkspace(workspaceId);
          hostInfo.registeredWorkspaces.delete(workspaceId);
          log.info(`Unregistered workspace ${workspaceId} from extension ${extId}`);
        } catch (error) {
          log.error(`Failed to unregister workspace ${workspaceId} from extension ${extId}:`, error);
        }
      })();

      unregistrations.push(unregistration);
    }

    // Wait for all unregistrations to complete
    await Promise.allSettled(unregistrations);

    // Clean up workspace metadata
    this.workspaceMetadata.delete(workspaceId);
  }

  /**
   * Send post-tool-use hook to appropriate extension hosts (with filtering)
   *
   * Called after a tool execution completes. Forwards the hook to all extension hosts
   * that should see this workspace, based on filtering rules.
   *
   * Extensions can modify the tool result. The last extension to modify wins.
   * Dispatches to hosts in parallel for faster execution. Individual failures are logged
   * but don't block other extensions.
   *
   * @param workspaceId - Unique identifier for the workspace
   * @param payload - Hook payload containing tool name, args, result, etc. (runtime will be injected by hosts)
   * @returns The (possibly modified) tool result
   */
  async postToolUse(
    workspaceId: string,
    payload: Omit<PostToolUseHookPayload, "runtime">
  ): Promise<unknown> {
    if (this.hosts.size === 0) {
      // No extensions loaded - return original result
      return payload.result;
    }

    const workspaceMetadata = this.workspaceMetadata.get(workspaceId);
    if (!workspaceMetadata) {
      log.error(`postToolUse called for unknown workspace ${workspaceId}`);
      return payload.result;
    }

    // Dispatch to filtered hosts in parallel
    const dispatches: Promise<{ extId: string; result: unknown }>[] = [];
    for (const [extId, hostInfo] of this.hosts) {
      // Apply workspace filtering
      if (!this.shouldHostSeeWorkspace(hostInfo.extensionInfo, workspaceMetadata.workspace)) {
        continue;
      }

      // Check if workspace is registered with this host
      if (!hostInfo.registeredWorkspaces.has(workspaceId)) {
        log.debug(`Workspace ${workspaceId} not registered with extension ${extId}, skipping hook`);
        continue;
      }

      // Dispatch hook to this extension
      const dispatch = (async () => {
        try {
          const result = await hostInfo.rpc.onPostToolUse(payload);
          return { extId, result };
        } catch (error) {
          log.error(`Extension ${extId} failed in onPostToolUse:`, error);
          // On error, return original result
          return { extId, result: payload.result };
        }
      })();

      dispatches.push(dispatch);
    }

    // Wait for all dispatches to complete
    const results = await Promise.allSettled(dispatches);
    
    // Collect all modified results
    // Last extension to modify wins (if multiple extensions modify)
    let finalResult = payload.result;
    for (const settled of results) {
      if (settled.status === "fulfilled" && settled.value.result !== payload.result) {
        finalResult = settled.value.result;
        log.debug(`Extension ${settled.value.extId} modified tool result`);
      }
    }
    
    return finalResult;
  }

  /**
   * Reload extensions by rediscovering from all sources and restarting hosts.
   * Automatically re-registers all previously registered workspaces.
   */
  async reload(): Promise<void> {
    log.info("Reloading extensions...");

    // Shutdown all existing hosts
    const shutdowns: Promise<void>[] = [];
    for (const [extId, hostInfo] of this.hosts) {
      const shutdown = (async () => {
        try {
          await hostInfo.rpc.shutdown();
          log.info(`Shut down extension host ${extId}`);
        } catch (error) {
          log.error(`Failed to gracefully shutdown extension ${extId}:`, error);
        } finally {
          // Kill process if still alive after 1 second
          setTimeout(() => {
            if (!hostInfo.process.killed) {
              hostInfo.process.kill();
            }
          }, 1000);

          hostInfo.transport.dispose();
        }
      })();

      shutdowns.push(shutdown);
    }

    await Promise.allSettled(shutdowns);
    this.hosts.clear();

    // Rediscover and load extensions
    await this.discoverAndLoad();

    // Re-register all workspaces with new hosts
    for (const [workspaceId, { workspace, runtimeConfig, runtimeTempDir }] of this
      .workspaceMetadata) {
      await this.registerWorkspace(workspaceId, workspace, runtimeConfig, runtimeTempDir);
    }

    log.info("Extension reload complete");
  }

  /**
   * Get the list of currently loaded extensions
   */
  listExtensions(): Array<ExtensionInfo> {
    return Array.from(this.hosts.values()).map((hostInfo) => hostInfo.extensionInfo);
  }

  /**
   * Shutdown all extension hosts
   *
   * Sends shutdown message to all hosts and waits for graceful shutdown
   * before forcefully killing processes.
   *
   * Safe to call even if no hosts exist (no-op).
   */
  async shutdown(): Promise<void> {
    if (this.hosts.size === 0) {
      return;
    }

    log.info(`Shutting down ${this.hosts.size} extension host(s)`);

    const shutdowns: Promise<void>[] = [];
    for (const [extId, hostInfo] of this.hosts) {
      const shutdown = (async () => {
        try {
          await hostInfo.rpc.shutdown();
          log.info(`Shut down extension host ${extId}`);
        } catch (error) {
          log.error(`Failed to gracefully shutdown extension ${extId}:`, error);
        } finally {
          // Kill process if still alive after 1 second
          setTimeout(() => {
            if (!hostInfo.process.killed) {
              hostInfo.process.kill();
            }
          }, 1000);

          hostInfo.transport.dispose();
        }
      })();

      shutdowns.push(shutdown);
    }

    await Promise.allSettled(shutdowns);
    this.hosts.clear();

    log.info("All extension hosts shut down");
  }
}
