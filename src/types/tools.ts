/**
 * Shared type definitions for AI tools
 * These types are used by both the tool implementations and UI components
 */

// Bash Tool Types
export interface BashToolArgs {
  script: string;
  timeout_secs: number;
  max_lines: number;
  stdin?: string;
}

interface CommonBashFields {
  // wall_duration_ms is provided to give the agent a sense of how long a command takes which
  // should inform future timeouts.
  wall_duration_ms: number;
}

export type BashToolResult =
  | (CommonBashFields & {
      success: true;
      output: string;
      exitCode: 0;
    })
  | (CommonBashFields & {
      success: false;
      output?: string;
      exitCode: number;
      error: string;
    });

// File Read Tool Types
export interface FileReadToolArgs {
  filePath: string;
  offset?: number; // 1-based starting line number (optional)
  limit?: number; // number of lines to return from offset (optional)
}

export type FileReadToolResult =
  | {
      success: true;
      file_size: number;
      modifiedTime: string;
      lines_read: number;
      content: string;
    }
  | {
      success: false;
      error: string;
    };

// File Edit Replace Tool Types
export interface FileEditReplaceEdit {
  old_string: string;
  new_string: string;
  replace_count?: number; // Default: 1, -1 means replace all
}

export interface FileEditReplaceToolArgs {
  file_path: string;
  edits: FileEditReplaceEdit[];
}

export type FileEditReplaceToolResult =
  | {
      success: true;
      edits_applied: number;
      diff: string;
    }
  | {
      success: false;
      error: string;
    };

// File Edit Insert Tool Types
export interface FileEditInsertToolArgs {
  file_path: string;
  line_offset: number; // 1-indexed line position (0 = insert at top, N = insert after line N)
  content: string;
}

export type FileEditInsertToolResult =
  | {
      success: true;
      diff: string;
    }
  | {
      success: false;
      error: string;
    };

// Propose Plan Tool Types
export interface ProposePlanToolArgs {
  title: string;
  plan: string;
}

export interface ProposePlanToolResult {
  success: true;
  title: string;
  plan: string;
  message: string;
}
