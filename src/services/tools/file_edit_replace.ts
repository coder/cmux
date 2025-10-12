import { tool } from "ai";
import type {
  FileEditReplaceToolArgs,
  FileEditReplaceToolResult,
  FileEditReplaceLinesPayload,
  FileEditReplaceStringPayload,
} from "@/types/tools";
import type { ToolConfiguration, ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";
import { executeFileEditOperation } from "./file_edit_operation";

interface OperationMetadata {
  edits_applied: number;
  lines_replaced?: number;
  line_delta?: number;
}

interface OperationResult {
  success: true;
  newContent: string;
  metadata: OperationMetadata;
}

/**
 * File edit replace tool factory for AI assistant.
 * Supports string replacements and line range replacements using a discriminated union payload.
 */
export const createFileEditReplaceTool: ToolFactory = (config: ToolConfiguration) => {
  return tool({
    description: TOOL_DEFINITIONS.file_edit_replace.description,
    inputSchema: TOOL_DEFINITIONS.file_edit_replace.schema,
    execute: async (args: FileEditReplaceToolArgs): Promise<FileEditReplaceToolResult> => {
      return executeFileEditOperation<OperationMetadata>({
        config,
        filePath: args.file_path,
        operation: (originalContent) => {
          if (args.mode === "string") {
            return handleStringReplace(args, originalContent);
          }

          if (args.mode === "lines") {
            return handleLineReplace(args, originalContent);
          }

          return {
            success: false,
            error: `Unsupported mode: ${(args as { mode?: string }).mode ?? "<missing>"}`,
          };
        },
      });
    },
  });
};

function handleStringReplace(
  args: FileEditReplaceStringPayload,
  originalContent: string
): OperationResult | { success: false; error: string } {
  const replaceCount = args.replace_count ?? 1;

  if (!originalContent.includes(args.old_string)) {
    return {
      success: false,
      error:
        "old_string not found in file. The text to replace must exist exactly as written in the file.",
    };
  }

  const parts = originalContent.split(args.old_string);
  const occurrences = parts.length - 1;

  if (replaceCount === 1 && occurrences > 1) {
    return {
      success: false,
      error: `old_string appears ${occurrences} times in the file. Either expand the context to make it unique or set replace_count to ${occurrences} or -1.`,
    };
  }

  if (replaceCount > occurrences && replaceCount !== -1) {
    return {
      success: false,
      error: `replace_count is ${replaceCount} but old_string only appears ${occurrences} time(s) in the file.`,
    };
  }

  let newContent: string;
  let editsApplied: number;

  if (replaceCount === -1) {
    newContent = parts.join(args.new_string);
    editsApplied = occurrences;
  } else {
    let replacedCount = 0;
    let currentContent = originalContent;

    for (let i = 0; i < replaceCount; i++) {
      const index = currentContent.indexOf(args.old_string);
      if (index === -1) {
        break;
      }

      currentContent =
        currentContent.substring(0, index) +
        args.new_string +
        currentContent.substring(index + args.old_string.length);
      replacedCount++;
    }

    newContent = currentContent;
    editsApplied = replacedCount;
  }

  return {
    success: true,
    newContent,
    metadata: {
      edits_applied: editsApplied,
    },
  };
}

function handleLineReplace(
  args: FileEditReplaceLinesPayload,
  originalContent: string
): OperationResult | { success: false; error: string } {
  const startIndex = args.start_line - 1;
  const endIndex = args.end_line - 1;

  if (args.start_line <= 0) {
    return {
      success: false,
      error: `start_line must be >= 1 (received ${args.start_line}).`,
    };
  }

  if (args.end_line < args.start_line) {
    return {
      success: false,
      error: `end_line must be >= start_line (received start ${args.start_line}, end ${args.end_line}).`,
    };
  }

  const lines = originalContent.split("\n");

  if (startIndex >= lines.length) {
    return {
      success: false,
      error: `start_line ${args.start_line} exceeds current file length (${lines.length}).`,
    };
  }

  const clampedEndIndex = Math.min(endIndex, lines.length - 1);
  const currentRange = lines.slice(startIndex, clampedEndIndex + 1);

  if (args.expected_lines && !arraysEqual(currentRange, args.expected_lines)) {
    return {
      success: false,
      error: `expected_lines validation failed. Current lines [${currentRange.join("\n")}] differ from expected [${args.expected_lines.join("\n")}].`,
    };
  }

  const before = lines.slice(0, startIndex);
  const after = lines.slice(clampedEndIndex + 1);
  const updatedLines = [...before, ...args.new_lines, ...after];
  const linesReplaced = currentRange.length;
  const totalDelta = args.new_lines.length - currentRange.length;

  return {
    success: true,
    newContent: updatedLines.join("\n"),
    metadata: {
      edits_applied: 1,
      lines_replaced: linesReplaced,
      line_delta: totalDelta,
    },
  };
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}
