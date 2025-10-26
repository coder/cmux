/**
 * Runtime abstraction for executing tools in different environments.
 *
 * DESIGN PRINCIPLE: Keep this interface minimal and low-level.
 * - Prefer streaming primitives over buffered APIs
 * - Implement shared helpers (utils/runtime/) that work across all runtimes
 * - Avoid duplicating helper logic in each runtime implementation
 *
 * This interface allows tools to run locally, in Docker containers, over SSH, etc.
 */

/**
 * PATH TERMINOLOGY & HIERARCHY
 *
 * srcBaseDir (base directory for all workspaces):
 *   - Where cmux stores ALL workspace directories
 *   - Local: ~/.cmux/src
 *   - SSH: /home/user/workspace (or custom remote path)
 *
 * Workspace Path Computation:
 *   {srcBaseDir}/{projectName}/{workspaceName}
 *
 *   - projectName: basename(projectPath)
 *     Example: "/Users/me/git/my-project" → "my-project"
 *
 *   - workspaceName: branch name or custom name
 *     Example: "feature-123" or "main"
 *
 * Full Example (Local):
 *   srcBaseDir:    ~/.cmux/src
 *   projectPath:   /Users/me/git/my-project (local git repo)
 *   projectName:   my-project (extracted)
 *   workspaceName: feature-123
 *   → Workspace:   ~/.cmux/src/my-project/feature-123
 *
 * Full Example (SSH):
 *   srcBaseDir:    /home/user/workspace
 *   projectPath:   /Users/me/git/my-project (local git repo)
 *   projectName:   my-project (extracted)
 *   workspaceName: feature-123
 *   → Workspace:   /home/user/workspace/my-project/feature-123
 */

/**
 * Options for executing a command
 */
export interface ExecOptions {
  /** Working directory for command execution */
  cwd: string;
  /** Environment variables to inject */
  env?: Record<string, string>;
  /**
   * Timeout in seconds (REQUIRED)
   *
   * Prevents zombie processes by ensuring all spawned processes are eventually killed.
   * Even long-running commands should have a reasonable upper bound (e.g., 3600s for 1 hour).
   */
  timeout: number;
  /** Process niceness level (-20 to 19, lower = higher priority) */
  niceness?: number;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * Streaming result from executing a command
 */
export interface ExecStream {
  /** Standard output stream */
  stdout: ReadableStream<Uint8Array>;
  /** Standard error stream */
  stderr: ReadableStream<Uint8Array>;
  /** Standard input stream */
  stdin: WritableStream<Uint8Array>;
  /** Promise that resolves with exit code when process completes */
  exitCode: Promise<number>;
  /** Promise that resolves with wall clock duration in milliseconds */
  duration: Promise<number>;
}

/**
 * File statistics
 */
export interface FileStat {
  /** File size in bytes */
  size: number;
  /** Last modified time */
  modifiedTime: Date;
  /** True if path is a directory (false implies regular file for our purposes) */
  isDirectory: boolean;
}

/**
 * Logger for streaming workspace initialization events to frontend.
 * Used to report progress during workspace creation and init hook execution.
 */
export interface InitLogger {
  /** Log a creation step (e.g., "Creating worktree", "Syncing files") */
  logStep(message: string): void;
  /** Log stdout line from init hook */
  logStdout(line: string): void;
  /** Log stderr line from init hook */
  logStderr(line: string): void;
  /** Report init hook completion */
  logComplete(exitCode: number): void;
}

/**
 * Parameters for workspace creation
 */
export interface WorkspaceCreationParams {
  /** Absolute path to project directory on local machine */
  projectPath: string;
  /** Branch name to checkout in workspace */
  branchName: string;
  /** Trunk branch to base new branches on */
  trunkBranch: string;
  /** Directory name to use for workspace (typically branch name) */
  directoryName: string;
  /** Logger for streaming creation progress and init hook output */
  initLogger: InitLogger;
}

/**
 * Result from workspace creation
 */
export interface WorkspaceCreationResult {
  success: boolean;
  /** Absolute path to workspace (local path for LocalRuntime, remote path for SSHRuntime) */
  workspacePath?: string;
  error?: string;
}

/**
 * Parameters for workspace initialization
 */
export interface WorkspaceInitParams {
  /** Absolute path to project directory on local machine */
  projectPath: string;
  /** Branch name to checkout in workspace */
  branchName: string;
  /** Trunk branch to base new branches on */
  trunkBranch: string;
  /** Absolute path to workspace (from createWorkspace result) */
  workspacePath: string;
  /** Logger for streaming initialization progress and output */
  initLogger: InitLogger;
}

/**
 * Result from workspace initialization
 */
export interface WorkspaceInitResult {
  success: boolean;
  error?: string;
}

/**
 * Runtime interface - minimal, low-level abstraction for tool execution environments.
 *
 * All methods return streaming primitives for memory efficiency.
 * Use helpers in utils/runtime/ for convenience wrappers (e.g., readFileString, execBuffered).
 */
export interface Runtime {
  /**
   * Execute a bash command with streaming I/O
   * @param command The bash script to execute
   * @param options Execution options (cwd, env, timeout, etc.)
   * @returns Promise that resolves to streaming handles for stdin/stdout/stderr and completion promises
   * @throws RuntimeError if execution fails in an unrecoverable way
   */
  exec(command: string, options: ExecOptions): Promise<ExecStream>;

  /**
   * Read file contents as a stream
   * @param path Absolute or relative path to file
   * @returns Readable stream of file contents
   * @throws RuntimeError if file cannot be read
   */
  readFile(path: string): ReadableStream<Uint8Array>;

  /**
   * Write file contents atomically from a stream
   * @param path Absolute or relative path to file
   * @returns Writable stream for file contents
   * @throws RuntimeError if file cannot be written
   */
  writeFile(path: string): WritableStream<Uint8Array>;

  /**
   * Get file statistics
   * @param path Absolute or relative path to file/directory
   * @returns File statistics
   * @throws RuntimeError if path does not exist or cannot be accessed
   */
  stat(path: string): Promise<FileStat>;

  /**
   * Compute absolute workspace path from project and workspace name.
   * This is the SINGLE source of truth for workspace path computation.
   *
   * - LocalRuntime: {workdir}/{project-name}/{workspace-name}
   * - SSHRuntime: {workdir}/{project-name}/{workspace-name}
   *
   * All Runtime methods (create, delete, rename) MUST use this method internally
   * to ensure consistent path computation.
   *
   * @param projectPath Project root path (local path, used to extract project name)
   * @param workspaceName Workspace name (typically branch name)
   * @returns Absolute path to workspace directory
   */
  getWorkspacePath(projectPath: string, workspaceName: string): string;

  /**
   * Create a workspace for this runtime (fast, returns immediately)
   * - LocalRuntime: Creates git worktree
   * - SSHRuntime: Creates remote directory only
   * Does NOT run init hook or sync files.
   * @param params Workspace creation parameters
   * @returns Result with workspace path or error
   */
  createWorkspace(params: WorkspaceCreationParams): Promise<WorkspaceCreationResult>;

  /**
   * Initialize workspace asynchronously (may be slow, streams progress)
   * - LocalRuntime: Runs init hook if present
   * - SSHRuntime: Syncs files, checks out branch, runs init hook
   * Streams progress via initLogger.
   * @param params Workspace initialization parameters
   * @returns Result indicating success or error
   */
  initWorkspace(params: WorkspaceInitParams): Promise<WorkspaceInitResult>;

  /**
   * Rename workspace directory
   * - LocalRuntime: Uses git worktree move (worktrees managed by git)
   * - SSHRuntime: Uses mv (plain directories on remote, not worktrees)
   * Runtime computes workspace paths internally from workdir + projectPath + workspace names.
   * @param projectPath Project root path (local path, used for git commands in LocalRuntime and to extract project name)
   * @param oldName Current workspace name
   * @param newName New workspace name
   * @returns Promise resolving to Result with old/new paths on success, or error message
   */
  renameWorkspace(
    projectPath: string,
    oldName: string,
    newName: string
  ): Promise<
    { success: true; oldPath: string; newPath: string } | { success: false; error: string }
  >;

  /**
   * Delete workspace directory
   * - LocalRuntime: Uses git worktree remove (with --force only if force param is true)
   * - SSHRuntime: Checks for uncommitted changes unless force is true, then uses rm -rf
   * Runtime computes workspace path internally from workdir + projectPath + workspaceName.
   *
   * **CRITICAL: Implementations must NEVER auto-apply --force or skip dirty checks without explicit force=true.**
   * If workspace has uncommitted changes and force=false, implementations MUST return error.
   * The force flag is the user's explicit intent - implementations must not override it.
   *
   * @param projectPath Project root path (local path, used for git commands in LocalRuntime and to extract project name)
   * @param workspaceName Workspace name to delete
   * @param force If true, force deletion even with uncommitted changes or special conditions (submodules, etc.)
   * @returns Promise resolving to Result with deleted path on success, or error message
   */
  deleteWorkspace(
    projectPath: string,
    workspaceName: string,
    force: boolean
  ): Promise<{ success: true; deletedPath: string } | { success: false; error: string }>;
}

/**
 * Error thrown by runtime implementations
 */
export class RuntimeError extends Error {
  constructor(
    message: string,
    public readonly type: "exec" | "file_io" | "network" | "unknown",
    public readonly cause?: Error
  ) {
    super(message);
    this.name = "RuntimeError";
  }
}
