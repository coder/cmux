/**
 * Shared implementation for file edit replace tools
 *
 * These helpers are used by both string-based and line-based replace tools,
 * providing the core logic while keeping the tool definitions simple for AI providers.
 */

interface OperationMetadata {
  edits_applied: number;
  lines_replaced?: number;
  line_delta?: number;
}

export interface OperationResult {
  success: true;
  newContent: string;
  metadata: OperationMetadata;
}

export interface OperationError {
  success: false;
  error: string;
}

export type OperationOutcome = OperationResult | OperationError;

export interface StringReplaceArgs {
  file_path: string;
  old_string: string;
  new_string: string;
  replace_count?: number;
}

export interface LineReplaceArgs {
  file_path: string;
  start_line: number;
  end_line: number;
  new_lines: string[] | string; // Accept both array and newline-delimited string
  expected_lines?: string[];
}

/**
 * Handle string-based replacement
 */
export function handleStringReplace(
  args: StringReplaceArgs,
  originalContent: string
): OperationOutcome {
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

/**
 * Handle line-range replacement
 * Accepts new_lines as either an array or a newline-delimited string for robustness
 */
export function handleLineReplace(
  args: LineReplaceArgs,
  originalContent: string
): OperationOutcome {
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

  // Normalize new_lines to array - accept both array and newline-delimited string
  // Empty string should map to empty array (no lines), not [""]
  const newLinesArray =
    typeof args.new_lines === "string"
      ? args.new_lines === ""
        ? []
        : args.new_lines.split("\n")
      : args.new_lines;

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
  const updatedLines = [...before, ...newLinesArray, ...after];
  const linesReplaced = currentRange.length;
  const totalDelta = newLinesArray.length - currentRange.length;

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
