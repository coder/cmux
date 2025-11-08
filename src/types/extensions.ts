import type { Runtime } from "@/runtime/Runtime";
import type { RuntimeConfig } from "./runtime";

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
  onPostToolUse?: (payload: PostToolUseHookPayload) => Promise<void> | void;
}

/**
 * Extension discovery result
 */
export interface ExtensionInfo {
  id: string; // Extension identifier (filename or folder name)
  path: string; // Absolute path to entrypoint file
  type: "file" | "folder";
  entrypoint?: string; // Relative entrypoint (for folder extensions)
}

/**
 * Workspace context sent to extension host on initialization
 */
export interface ExtensionHostContext {
  workspaceId: string;
  workspacePath: string;
  projectPath: string;
  runtimeConfig: RuntimeConfig;
  runtimeTempDir: string;
}

/**
 * IPC message types between main process and extension host
 */
export type ExtensionHostMessage =
  | {
      type: "init";
      extensions: ExtensionInfo[];
    }
  | {
      type: "register-workspace";
      workspaceId: string;
      workspacePath: string;
      projectPath: string;
      runtimeConfig: RuntimeConfig;
      runtimeTempDir: string;
    }
  | {
      type: "unregister-workspace";
      workspaceId: string;
    }
  | {
      type: "post-tool-use";
      payload: Omit<PostToolUseHookPayload, "runtime">;
    }
  | {
      type: "shutdown";
    };

export type ExtensionHostResponse =
  | {
      type: "ready";
      extensionCount: number;
    }
  | {
      type: "workspace-registered";
      workspaceId: string;
    }
  | {
      type: "workspace-unregistered";
      workspaceId: string;
    }
  | {
      type: "extension-load-error";
      id: string;
      error: string;
    }
  | {
      type: "extension-error";
      extensionId: string;
      error: string;
    }
  | {
      type: "hook-complete";
      hookType: "post-tool-use";
    };
