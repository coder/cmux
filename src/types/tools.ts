/**
 * Shared type definitions for AI tools
 * These types are used by both the tool implementations and UI components
 */

// Bash Tool Types
export interface BashToolArgs {
  script: string;
  timeout_secs?: number; // Optional: defaults to 3 seconds for interactivity
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

export interface FileEditDiffSuccessBase {
  success: true;
  diff: string;
}

export interface FileEditErrorResult {
  success: false;
  error: string;
}

export interface FileEditReplaceStringToolArgs {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_count?: number;
}

export type FileEditReplaceStringToolResult =
  | (FileEditDiffSuccessBase & {
      edits_applied: number;
    })
  | FileEditErrorResult;

export interface FileEditReplaceLinesToolArgs {
  file_path: string;
  start_line: number;
  end_line: number;
  new_lines: string[];
  expected_lines?: string[];
}

export type FileEditReplaceLinesToolResult =
  | (FileEditDiffSuccessBase & {
      edits_applied: number;
      lines_replaced: number;
      line_delta: number;
    })
  | FileEditErrorResult;

export type FileEditSharedToolResult =
  | FileEditReplaceStringToolResult
  | FileEditReplaceLinesToolResult
  | FileEditInsertToolResult;

export const FILE_EDIT_TOOL_NAMES = [
  "file_edit_replace_string",
  "file_edit_replace_lines",
  "file_edit_insert",
] as const;

export type FileEditToolName = (typeof FILE_EDIT_TOOL_NAMES)[number];

export interface FileEditInsertToolArgs {
  file_path: string;
  line_offset: number;
  content: string;
  create?: boolean;
}

export type FileEditInsertToolResult = FileEditDiffSuccessBase | FileEditErrorResult;

export type FileEditToolArgs =
  | FileEditReplaceStringToolArgs
  | FileEditReplaceLinesToolArgs
  | FileEditInsertToolArgs;

export interface FileEditToolMessage {
  toolName: FileEditToolName;
  args: FileEditToolArgs;
  result?: FileEditSharedToolResult;
}

export function isFileEditToolName(value: string): value is FileEditToolName {
  return (FILE_EDIT_TOOL_NAMES as readonly string[]).includes(value);
}

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

// Todo Tool Types
export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
}

export interface TodoWriteToolArgs {
  todos: TodoItem[];
}

export interface TodoWriteToolResult {
  success: true;
  count: number;
}

export interface TodoReadToolResult {
  todos: TodoItem[];
}
