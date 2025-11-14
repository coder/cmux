import { tool } from "ai";
import { RuntimeError } from "@/runtime/Runtime";
import type { FileEditInsertToolArgs, FileEditInsertToolResult } from "@/types/tools";
import { EDIT_FAILED_NOTE_PREFIX, NOTE_READ_FILE_RETRY } from "@/types/tools";
import type { ToolConfiguration, ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";
import { validateAndCorrectPath, validatePathInCwd } from "./fileCommon";
import { executeFileEditOperation } from "./file_edit_operation";
import { fileExists } from "@/utils/runtime/fileExists";
import { writeFileString } from "@/utils/runtime/helpers";

const READ_AND_RETRY_NOTE = `${EDIT_FAILED_NOTE_PREFIX} ${NOTE_READ_FILE_RETRY}`;

interface InsertOperationSuccess {
  success: true;
  newContent: string;
  metadata: Record<string, never>;
}

interface InsertOperationFailure {
  success: false;
  error: string;
  note?: string;
}

export const createFileEditInsertTool: ToolFactory = (config: ToolConfiguration) => {
  return tool({
    description: TOOL_DEFINITIONS.file_edit_insert.description,
    inputSchema: TOOL_DEFINITIONS.file_edit_insert.schema,
    execute: async (
      { file_path, content, line_offset, create, before, after }: FileEditInsertToolArgs,
      { abortSignal }
    ): Promise<FileEditInsertToolResult> => {
      try {
        const { correctedPath } = validateAndCorrectPath(file_path, config.cwd, config.runtime);
        file_path = correctedPath;

        const pathValidation = validatePathInCwd(file_path, config.cwd, config.runtime);
        if (pathValidation) {
          return {
            success: false,
            error: pathValidation.error,
          };
        }

        if (line_offset !== undefined && line_offset < 0) {
          return {
            success: false,
            error: `line_offset must be non-negative (got ${line_offset})`,
            note: `${EDIT_FAILED_NOTE_PREFIX} The line_offset must be >= 0.`,
          };
        }

        const resolvedPath = config.runtime.normalizePath(file_path, config.cwd);
        const exists = await fileExists(config.runtime, resolvedPath, abortSignal);

        if (!exists) {
          if (!create) {
            return {
              success: false,
              error: `File not found: ${file_path}. Set create: true to create it.`,
              note: `${EDIT_FAILED_NOTE_PREFIX} File does not exist. Set create: true to create it, or check the file path.`,
            };
          }

          try {
            await writeFileString(config.runtime, resolvedPath, "", abortSignal);
          } catch (err) {
            if (err instanceof RuntimeError) {
              return {
                success: false,
                error: err.message,
              };
            }
            throw err;
          }
        }

        return executeFileEditOperation({
          config,
          filePath: file_path,
          abortSignal,
          operation: (originalContent) =>
            insertContent(originalContent, content, {
              before,
              after,
              lineOffset: line_offset,
            }),
        });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "EACCES") {
          return {
            success: false,
            error: `Permission denied: ${file_path}`,
          };
        }

        const message = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to insert content: ${message}`,
        };
      }
    },
  });
};

function insertContent(
  originalContent: string,
  contentToInsert: string,
  { before, after, lineOffset }: { before?: string; after?: string; lineOffset?: number }
): InsertOperationSuccess | InsertOperationFailure {
  if (before !== undefined || after !== undefined) {
    return insertWithGuards(originalContent, contentToInsert, { before, after });
  }

  if (lineOffset === undefined) {
    return {
      success: false,
      error: "line_offset must be provided when before/after guards are omitted.",
      note: READ_AND_RETRY_NOTE,
    };
  }

  return insertWithLineOffset(originalContent, contentToInsert, lineOffset);
}

function insertWithGuards(
  originalContent: string,
  contentToInsert: string,
  { before, after }: { before?: string; after?: string }
): InsertOperationSuccess | InsertOperationFailure {
  let anchorIndex: number | undefined;

  if (before !== undefined) {
    const beforeIndexResult = findUniqueSubstringIndex(originalContent, before, "before");
    if (!beforeIndexResult.success) {
      return beforeIndexResult;
    }
    anchorIndex = beforeIndexResult.index + before.length;
  }

  if (after !== undefined) {
    const afterIndexResult = findUniqueSubstringIndex(originalContent, after, "after");
    if (!afterIndexResult.success) {
      return afterIndexResult;
    }

    if (anchorIndex === undefined) {
      anchorIndex = afterIndexResult.index;
    } else if (anchorIndex !== afterIndexResult.index) {
      return {
        success: false,
        error:
          "Guard mismatch: before and after substrings do not point to the same insertion point.",
        note: READ_AND_RETRY_NOTE,
      };
    }
  }

  if (anchorIndex === undefined) {
    return {
      success: false,
      error: "Unable to determine insertion point from guards.",
      note: READ_AND_RETRY_NOTE,
    };
  }

  const newContent =
    originalContent.slice(0, anchorIndex) + contentToInsert + originalContent.slice(anchorIndex);

  return {
    success: true,
    newContent,
    metadata: {},
  };
}

function findUniqueSubstringIndex(
  haystack: string,
  needle: string,
  label: "before" | "after"
): InsertOperationFailure | { success: true; index: number } {
  const firstIndex = haystack.indexOf(needle);
  if (firstIndex === -1) {
    return {
      success: false,
      error: `Guard mismatch: unable to find ${label} substring in the current file.`,
      note: READ_AND_RETRY_NOTE,
    };
  }

  const secondIndex = haystack.indexOf(needle, firstIndex + needle.length);
  if (secondIndex !== -1) {
    return {
      success: false,
      error: `Guard mismatch: ${label} substring matched multiple times. Provide a more specific string.`,
      note: READ_AND_RETRY_NOTE,
    };
  }

  return { success: true, index: firstIndex };
}

function insertWithLineOffset(
  originalContent: string,
  contentToInsert: string,
  lineOffset: number
): InsertOperationSuccess | InsertOperationFailure {
  const lines = originalContent.split("\n");
  if (lineOffset > lines.length) {
    return {
      success: false,
      error: `line_offset ${lineOffset} is beyond file length (${lines.length} lines)`,
      note: `${EDIT_FAILED_NOTE_PREFIX} The file has ${lines.length} lines. ${NOTE_READ_FILE_RETRY}`,
    };
  }

  const insertionIndex = getIndexForLineOffset(originalContent, lineOffset);
  if (insertionIndex === null) {
    return {
      success: false,
      error: `Unable to compute insertion point for line_offset ${lineOffset}.`,
      note: READ_AND_RETRY_NOTE,
    };
  }

  const newContent =
    originalContent.slice(0, insertionIndex) +
    contentToInsert +
    originalContent.slice(insertionIndex);

  return {
    success: true,
    newContent,
    metadata: {},
  };
}

function getIndexForLineOffset(content: string, lineOffset: number): number | null {
  if (lineOffset === 0) {
    return 0;
  }

  let linesAdvanced = 0;
  let cursor = 0;

  while (linesAdvanced < lineOffset) {
    const nextNewline = content.indexOf("\n", cursor);
    if (nextNewline === -1) {
      if (linesAdvanced + 1 === lineOffset) {
        return content.length;
      }
      return null;
    }

    linesAdvanced += 1;
    cursor = nextNewline + 1;

    if (linesAdvanced === lineOffset) {
      return cursor;
    }
  }

  return null;
}
