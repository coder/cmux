/**
 * Shared type definitions for AI tools
 * These types are used by both the tool implementations and UI components
 */

// Bash Tool Types
export interface BashToolArgs {
  script: string;
  timeout_secs: number;
}

interface CommonBashFields {
  // wall_duration_ms is provided to give the agent a sense of how long a command takes which
  // should inform future timeouts.
  wall_duration_ms: number;
}

export type BashToolResult =
  | (CommonBashFields & {
      success: true;
      stdout: string;
      stderr: string;
      exitCode: 0;
    })
  | (CommonBashFields & {
      success: false;
      stdout?: string;
      stderr?: string;
      exitCode: number;
      error: string;
    });

// Read File Tool Types
export interface ReadFileToolArgs {
  filePath: string;
  encoding?: "utf-8" | "ascii" | "base64" | "hex" | "binary";
  offset?: number; // 1-based starting line number (optional)
  limit?: number; // number of lines to return from offset (optional)
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

// Edit File Tool Types
export interface EditFileEdit {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

export interface EditFileToolArgs {
  file_path: string;
  edits: EditFileEdit[];
}

export type EditFileToolResult =
  | {
      success: true;
      edits_applied: number;
    }
  | {
      success: false;
      error: string;
    };
