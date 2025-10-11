/**
 * Runtime abstraction for executing tools in different environments.
 * This interface allows tools to run locally, in Docker containers, over SSH, etc.
 */

/**
 * Options for executing a command
 */
export interface ExecOptions {
  /** Working directory for command execution */
  cwd: string;
  /** Environment variables to inject */
  env?: Record<string, string>;
  /** Standard input to pipe to command */
  stdin?: string;
  /** Timeout in seconds */
  timeout?: number;
  /** Process niceness level (-20 to 19, lower = higher priority) */
  niceness?: number;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * Result from executing a command
 */
export interface ExecResult {
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Exit code (0 = success) */
  exitCode: number;
  /** Wall clock duration in milliseconds */
  duration: number;
}

/**
 * File statistics
 */
export interface FileStat {
  /** File size in bytes */
  size: number;
  /** Last modified time */
  modifiedTime: Date;
  /** True if path is a file */
  isFile: boolean;
  /** True if path is a directory */
  isDirectory: boolean;
}

/**
 * Runtime interface - minimal abstraction for tool execution environments
 */
export interface Runtime {
  /**
   * Execute a bash command
   * @param command The bash script to execute
   * @param options Execution options (cwd, env, timeout, etc.)
   * @returns Result with stdout, stderr, exit code, and duration
   * @throws RuntimeError if execution fails in an unrecoverable way
   */
  exec(command: string, options: ExecOptions): Promise<ExecResult>;

  /**
   * Read file contents as UTF-8 string
   * @param path Absolute or relative path to file
   * @returns File contents as string
   * @throws RuntimeError if file cannot be read
   */
  readFile(path: string): Promise<string>;

  /**
   * Write file contents atomically
   * @param path Absolute or relative path to file
   * @param content File contents to write
   * @throws RuntimeError if file cannot be written
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Get file statistics
   * @param path Absolute or relative path to file/directory
   * @returns File statistics
   * @throws RuntimeError if path does not exist or cannot be accessed
   */
  stat(path: string): Promise<FileStat>;

  /**
   * Check if path exists
   * @param path Absolute or relative path to check
   * @returns True if path exists, false otherwise
   */
  exists(path: string): Promise<boolean>;
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
