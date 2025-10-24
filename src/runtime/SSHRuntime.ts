import { spawn } from "child_process";
import { Readable, Writable } from "stream";
import type {
  Runtime,
  ExecOptions,
  ExecStream,
  FileStat,
  WorkspaceCreationParams,
  WorkspaceCreationResult,
} from "./Runtime";
import { RuntimeError as RuntimeErrorClass } from "./Runtime";

/**
 * SSH Runtime Configuration
 */
export interface SSHRuntimeConfig {
  /** SSH host (can be hostname, user@host, or SSH config alias) */
  host: string;
  /** Working directory on remote host */
  workdir: string;
  /** Optional: Path to SSH private key (if not using ~/.ssh/config or ssh-agent) */
  identityFile?: string;
  /** Optional: SSH port (default: 22) */
  port?: number;
}

/**
 * SSH runtime implementation that executes commands and file operations
 * over SSH using the ssh command-line tool.
 *
 * Features:
 * - Uses system ssh command (respects ~/.ssh/config)
 * - Supports SSH config aliases, ProxyJump, ControlMaster, etc.
 * - No password prompts (assumes key-based auth or ssh-agent)
 * - Atomic file writes via temp + rename
 */
export class SSHRuntime implements Runtime {
  private readonly config: SSHRuntimeConfig;

  constructor(config: SSHRuntimeConfig) {
    this.config = config;
  }

  /**
   * Execute command over SSH with streaming I/O
   */
  exec(command: string, options: ExecOptions): ExecStream {
    const startTime = performance.now();

    // Build environment string
    let envPrefix = "";
    if (options.env) {
      const envPairs = Object.entries(options.env)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(" ");
      envPrefix = `export ${envPairs}; `;
    }

    // Build full command with cwd and env
    const remoteCommand = `cd ${JSON.stringify(options.cwd)} && ${envPrefix}${command}`;

    // Build SSH args
    const sshArgs: string[] = ["-T"];

    // Add port if specified
    if (this.config.port) {
      sshArgs.push("-p", this.config.port.toString());
    }

    // Add identity file if specified
    if (this.config.identityFile) {
      sshArgs.push("-i", this.config.identityFile);
      // Disable strict host key checking for test environments
      sshArgs.push("-o", "StrictHostKeyChecking=no");
      sshArgs.push("-o", "UserKnownHostsFile=/dev/null");
      sshArgs.push("-o", "LogLevel=ERROR"); // Suppress SSH warnings
    }

    sshArgs.push(this.config.host, remoteCommand);

    // Spawn ssh command
    const sshProcess = spawn("ssh", sshArgs, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    // Convert Node.js streams to Web Streams
    const stdout = Readable.toWeb(sshProcess.stdout) as unknown as ReadableStream<Uint8Array>;
    const stderr = Readable.toWeb(sshProcess.stderr) as unknown as ReadableStream<Uint8Array>;
    const stdin = Writable.toWeb(sshProcess.stdin) as unknown as WritableStream<Uint8Array>;

    // Create promises for exit code and duration
    const exitCode = new Promise<number>((resolve, reject) => {
      sshProcess.on("close", (code, signal) => {
        if (options.abortSignal?.aborted) {
          reject(new RuntimeErrorClass("Command execution was aborted", "exec"));
          return;
        }
        if (signal === "SIGTERM" && options.timeout !== undefined) {
          reject(
            new RuntimeErrorClass(`Command exceeded timeout of ${options.timeout} seconds`, "exec")
          );
          return;
        }
        resolve(code ?? (signal ? -1 : 0));
      });

      sshProcess.on("error", (err) => {
        reject(new RuntimeErrorClass(`Failed to execute SSH command: ${err.message}`, "exec", err));
      });
    });

    const duration = exitCode.then(() => performance.now() - startTime);

    // Handle abort signal
    if (options.abortSignal) {
      options.abortSignal.addEventListener("abort", () => sshProcess.kill());
    }

    // Handle timeout
    if (options.timeout !== undefined) {
      setTimeout(() => sshProcess.kill(), options.timeout * 1000);
    }

    return { stdout, stderr, stdin, exitCode, duration };
  }

  /**
   * Read file contents over SSH as a stream
   */
  readFile(path: string): ReadableStream<Uint8Array> {
    const stream = this.exec(`cat ${JSON.stringify(path)}`, {
      cwd: this.config.workdir,
      timeout: 300, // 5 minutes - reasonable for large files
    });

    // Return stdout, but wrap to handle errors from exit code
    return new ReadableStream<Uint8Array>({
      async start(controller: ReadableStreamDefaultController<Uint8Array>) {
        try {
          const reader = stream.stdout.getReader();
          const exitCode = stream.exitCode;

          // Read all chunks
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
          }

          // Check exit code after reading completes
          const code = await exitCode;
          if (code !== 0) {
            const stderr = await streamToString(stream.stderr);
            throw new RuntimeErrorClass(`Failed to read file ${path}: ${stderr}`, "file_io");
          }

          controller.close();
        } catch (err) {
          if (err instanceof RuntimeErrorClass) {
            controller.error(err);
          } else {
            controller.error(
              new RuntimeErrorClass(
                `Failed to read file ${path}: ${err instanceof Error ? err.message : String(err)}`,
                "file_io",
                err instanceof Error ? err : undefined
              )
            );
          }
        }
      },
    });
  }

  /**
   * Write file contents over SSH atomically from a stream
   */
  writeFile(path: string): WritableStream<Uint8Array> {
    const tempPath = `${path}.tmp.${Date.now()}`;
    // Create parent directory if needed, then write file atomically
    const writeCommand = `mkdir -p $(dirname ${JSON.stringify(path)}) && cat > ${JSON.stringify(tempPath)} && chmod 600 ${JSON.stringify(tempPath)} && mv ${JSON.stringify(tempPath)} ${JSON.stringify(path)}`;

    const stream = this.exec(writeCommand, {
      cwd: this.config.workdir,
      timeout: 300, // 5 minutes - reasonable for large files
    });

    // Wrap stdin to handle errors from exit code
    return new WritableStream<Uint8Array>({
      async write(chunk: Uint8Array) {
        const writer = stream.stdin.getWriter();
        try {
          await writer.write(chunk);
        } finally {
          writer.releaseLock();
        }
      },
      async close() {
        // Close stdin and wait for command to complete
        await stream.stdin.close();
        const exitCode = await stream.exitCode;

        if (exitCode !== 0) {
          const stderr = await streamToString(stream.stderr);
          throw new RuntimeErrorClass(`Failed to write file ${path}: ${stderr}`, "file_io");
        }
      },
      async abort(reason?: unknown) {
        await stream.stdin.abort();
        throw new RuntimeErrorClass(`Failed to write file ${path}: ${String(reason)}`, "file_io");
      },
    });
  }

  /**
   * Get file statistics over SSH
   */
  async stat(path: string): Promise<FileStat> {
    // Use stat with format string to get: size, mtime, type
    // %s = size, %Y = mtime (seconds since epoch), %F = file type
    const stream = this.exec(`stat -c '%s %Y %F' ${JSON.stringify(path)}`, {
      cwd: this.config.workdir,
      timeout: 10, // 10 seconds - stat should be fast
    });

    const [stdout, stderr, exitCode] = await Promise.all([
      streamToString(stream.stdout),
      streamToString(stream.stderr),
      stream.exitCode,
    ]);

    if (exitCode !== 0) {
      throw new RuntimeErrorClass(`Failed to stat ${path}: ${stderr}`, "file_io");
    }

    const parts = stdout.trim().split(" ");
    if (parts.length < 3) {
      throw new RuntimeErrorClass(`Failed to parse stat output for ${path}: ${stdout}`, "file_io");
    }

    const size = parseInt(parts[0], 10);
    const mtime = parseInt(parts[1], 10);
    const fileType = parts.slice(2).join(" ");

    return {
      size,
      modifiedTime: new Date(mtime * 1000),
      isDirectory: fileType === "directory",
    };
  }

  async createWorkspace(params: WorkspaceCreationParams): Promise<WorkspaceCreationResult> {
    const { initLogger } = params;

    initLogger.logStep("SSH workspace creation not yet implemented");
    
    return {
      success: false,
      error: "SSH workspace creation is not yet implemented. Use local workspaces for now.",
    };
  }
}

/**
 * Helper to convert a ReadableStream to a string
 */
async function streamToString(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");
  let result = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
    return result;
  } finally {
    reader.releaseLock();
  }
}
