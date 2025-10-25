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
 * Options for executing a command
 */
export interface ExecOptions {
  /** Working directory for command execution (defaults to runtime's workdir) */
  cwd?: string;
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
   * @returns Streaming handles for stdin/stdout/stderr and completion promises
   * @throws RuntimeError if execution fails in an unrecoverable way
   */
  exec(command: string, options: ExecOptions): ExecStream;

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
