/**
 * Shared type definitions for AI tools
 * These types are used by both the tool implementations and UI components
 */

// Bash Tool Types
export interface BashToolArgs {
  script: string;
  timeout_secs: number;
}

export type BashToolResult =
  | {
      success: true;
      stdout: string;
      stderr: string;
      exitCode: 0;
    }
  | {
      success: false;
      stdout?: string;
      stderr?: string;
      exitCode: number;
      error: string;
    };

// Read File Tool Types
export interface ReadFileToolArgs {
  filePath: string;
  encoding?: "utf-8" | "ascii" | "base64" | "hex" | "binary";
  start: number;
  end: number;
}

export type ReadFileToolResult =
  | {
      success: true;
      size: number;
      modifiedTime: string;
      encoding: string;
      bytes_read: number;
      content: string;
    }
  | {
      success: false;
      error: string;
    };
