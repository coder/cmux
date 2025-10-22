import { Client as SSHClient, type ConnectConfig, type SFTPWrapper } from "ssh2";
import type { Runtime, ExecOptions, ExecResult, FileStat } from "./Runtime";
import { RuntimeError as RuntimeErrorClass } from "./Runtime";

/**
 * SSH Runtime Configuration
 */
export interface SSHRuntimeConfig {
  host: string;
  user: string;
  port?: number;
  /** Path to private key file */
  keyPath?: string;
  /** Password authentication (if no keyPath) */
  password?: string;
  /** Working directory on remote host */
  workdir: string;
}

/**
 * SSH runtime implementation that executes commands and file operations
 * over SSH using ssh2 library.
 *
 * Features:
 * - Persistent connection pooling per instance
 * - SFTP for file operations
 * - Exec with stdin, env, timeout, abort support
 * - Automatic reconnection on connection loss
 */
export class SSHRuntime implements Runtime {
  private readonly config: SSHRuntimeConfig;
  private sshClient: SSHClient | null = null;
  private sftpClient: SFTPWrapper | null = null;
  private connecting: Promise<void> | null = null;

  constructor(config: SSHRuntimeConfig) {
    this.config = config;
  }

  /**
   * Ensure SSH connection is established
   */
  private async ensureConnected(): Promise<void> {
    // If already connecting, wait for that
    if (this.connecting) {
      return this.connecting;
    }

    // If already connected, return
    if (this.sshClient && this.sftpClient) {
      return;
    }

    // Start connecting
    this.connecting = this.connect();
    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  /**
   * Establish SSH connection and SFTP session
   */
  private async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const client = new SSHClient();

      const connectConfig: ConnectConfig = {
        host: this.config.host,
        port: this.config.port ?? 22,
        username: this.config.user,
      };

      // Add auth method
      if (this.config.keyPath) {
        connectConfig.privateKey = require("fs").readFileSync(this.config.keyPath);
      } else if (this.config.password) {
        connectConfig.password = this.config.password;
      } else {
        reject(
          new RuntimeErrorClass(
            "SSH configuration must provide either keyPath or password",
            "network"
          )
        );
        return;
      }

      client.on("ready", () => {
        // Request SFTP subsystem
        client.sftp((err, sftp) => {
          if (err) {
            client.end();
            reject(
              new RuntimeErrorClass(`Failed to create SFTP session: ${err.message}`, "network", err)
            );
            return;
          }

          this.sshClient = client;
          this.sftpClient = sftp;
          resolve();
        });
      });

      client.on("error", (err) => {
        reject(new RuntimeErrorClass(`SSH connection error: ${err.message}`, "network", err));
      });

      client.on("close", () => {
        this.sshClient = null;
        this.sftpClient = null;
      });

      client.connect(connectConfig);
    });
  }

  /**
   * Close SSH connection
   */
  async close(): Promise<void> {
    if (this.sftpClient) {
      this.sftpClient.end();
      this.sftpClient = null;
    }
    if (this.sshClient) {
      this.sshClient.end();
      this.sshClient = null;
    }
  }

  async exec(command: string, options: ExecOptions): Promise<ExecResult> {
    await this.ensureConnected();

    if (!this.sshClient) {
      throw new RuntimeErrorClass("SSH client not connected", "network");
    }

    const startTime = performance.now();

    return new Promise<ExecResult>((resolve, reject) => {
      // Build environment string
      let envPrefix = "";
      if (options.env) {
        const envPairs = Object.entries(options.env)
          .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
          .join(" ");
        envPrefix = `export ${envPairs}; `;
      }

      // Build full command with cwd and env
      const fullCommand = `cd ${JSON.stringify(options.cwd)} && ${envPrefix}${command}`;

      let stdout = "";
      let stderr = "";
      let resolved = false;
      let timeoutHandle: NodeJS.Timeout | null = null;

      const resolveOnce = (result: ExecResult) => {
        if (!resolved) {
          resolved = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          resolve(result);
        }
      };

      const rejectOnce = (error: RuntimeErrorClass) => {
        if (!resolved) {
          resolved = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          reject(error);
        }
      };

      // Set timeout
      const timeout = options.timeout ?? 3;
      timeoutHandle = setTimeout(() => {
        rejectOnce(new RuntimeErrorClass(`Command timed out after ${timeout} seconds`, "exec"));
      }, timeout * 1000);

      // Handle abort signal
      if (options.abortSignal) {
        options.abortSignal.addEventListener("abort", () => {
          rejectOnce(new RuntimeErrorClass("Command aborted", "exec"));
        });
      }

      this.sshClient!.exec(fullCommand, { pty: false }, (err, stream) => {
        if (err) {
          rejectOnce(
            new RuntimeErrorClass(`Failed to execute command: ${err.message}`, "exec", err)
          );
          return;
        }

        // Pipe stdin if provided
        if (options.stdin) {
          stream.write(options.stdin);
          stream.end();
        }

        stream.on("data", (data: Buffer) => {
          stdout += data.toString("utf-8");
        });

        stream.stderr.on("data", (data: Buffer) => {
          stderr += data.toString("utf-8");
        });

        stream.on("close", (code: number) => {
          const duration = performance.now() - startTime;
          resolveOnce({
            stdout,
            stderr,
            exitCode: code ?? 0,
            duration,
          });
        });

        stream.on("error", (err: Error) => {
          rejectOnce(new RuntimeErrorClass(`Stream error: ${err.message}`, "exec", err));
        });
      });
    });
  }

  async readFile(path: string): Promise<string> {
    await this.ensureConnected();

    if (!this.sftpClient) {
      throw new RuntimeErrorClass("SFTP client not connected", "network");
    }

    return new Promise((resolve, reject) => {
      this.sftpClient!.readFile(path, "utf8", (err, data) => {
        if (err) {
          reject(
            new RuntimeErrorClass(`Failed to read file ${path}: ${err.message}`, "file_io", err)
          );
        } else {
          resolve(data.toString());
        }
      });
    });
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.ensureConnected();

    if (!this.sftpClient) {
      throw new RuntimeErrorClass("SFTP client not connected", "network");
    }

    // Write to temp file first, then rename for atomicity
    const tempPath = `${path}.tmp.${Date.now()}`;

    return new Promise((resolve, reject) => {
      // Write file
      this.sftpClient!.writeFile(tempPath, Buffer.from(content, "utf-8"), (err) => {
        if (err) {
          reject(
            new RuntimeErrorClass(`Failed to write file ${path}: ${err.message}`, "file_io", err)
          );
          return;
        }

        // Set permissions (umask 077 equivalent)
        this.sftpClient!.chmod(tempPath, 0o600, (err) => {
          if (err) {
            reject(
              new RuntimeErrorClass(`Failed to chmod file ${path}: ${err.message}`, "file_io", err)
            );
            return;
          }

          // Rename to final path
          this.sftpClient!.rename(tempPath, path, (err) => {
            if (err) {
              reject(
                new RuntimeErrorClass(
                  `Failed to rename file ${path}: ${err.message}`,
                  "file_io",
                  err
                )
              );
            } else {
              resolve();
            }
          });
        });
      });
    });
  }

  async stat(path: string): Promise<FileStat> {
    await this.ensureConnected();

    if (!this.sftpClient) {
      throw new RuntimeErrorClass("SFTP client not connected", "network");
    }

    return new Promise((resolve, reject) => {
      this.sftpClient!.stat(path, (err, stats) => {
        if (err) {
          reject(new RuntimeErrorClass(`Failed to stat ${path}: ${err.message}`, "file_io", err));
        } else {
          resolve({
            size: stats.size,
            modifiedTime: new Date(stats.mtime * 1000),
            isFile: stats.isFile(),
            isDirectory: stats.isDirectory(),
          });
        }
      });
    });
  }

  async exists(path: string): Promise<boolean> {
    await this.ensureConnected();

    if (!this.sftpClient) {
      throw new RuntimeErrorClass("SFTP client not connected", "network");
    }

    return new Promise((resolve) => {
      this.sftpClient!.stat(path, (err) => {
        resolve(!err);
      });
    });
  }
}
