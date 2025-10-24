import * as fs from "fs/promises";
import * as path from "path";
import writeFileAtomic from "write-file-atomic";
import type { FileEditDiffSuccessBase, FileEditErrorResult } from "@/types/tools";
import { WRITE_DENIED_PREFIX } from "@/types/tools";
import type { ToolConfiguration } from "@/utils/tools/tools";
import { generateDiff, validateFileSize, validatePathInCwd } from "./fileCommon";

type FileEditOperationResult<TMetadata> =
  | {
      success: true;
      newContent: string;
      metadata: TMetadata;
    }
  | {
      success: false;
      error: string;
    };

interface ExecuteFileEditOperationOptions<TMetadata> {
  config: ToolConfiguration;
  filePath: string;
  operation: (
    originalContent: string
  ) => FileEditOperationResult<TMetadata> | Promise<FileEditOperationResult<TMetadata>>;
}

/**
 * Shared execution pipeline for file edit tools.
 * Handles validation, file IO, diff generation, and common error handling.
 */
export async function executeFileEditOperation<TMetadata>({
  config,
  filePath,
  operation,
}: ExecuteFileEditOperationOptions<TMetadata>): Promise<
  FileEditErrorResult | (FileEditDiffSuccessBase & TMetadata)
> {
  try {
    const pathValidation = validatePathInCwd(filePath, config.cwd);
    if (pathValidation) {
      return {
        success: false,
        error: `${WRITE_DENIED_PREFIX} ${pathValidation.error}`,
      };
    }

    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(config.cwd, filePath);

    const stats = await fs.stat(resolvedPath);
    if (!stats.isFile()) {
      return {
        success: false,
        error: `${WRITE_DENIED_PREFIX} Path exists but is not a file: ${resolvedPath}`,
      };
    }

    const sizeValidation = validateFileSize(stats);
    if (sizeValidation) {
      return {
        success: false,
        error: `${WRITE_DENIED_PREFIX} ${sizeValidation.error}`,
      };
    }

    const originalContent = await fs.readFile(resolvedPath, { encoding: "utf-8" });

    const operationResult = await Promise.resolve(operation(originalContent));
    if (!operationResult.success) {
      return {
        success: false,
        error: `${WRITE_DENIED_PREFIX} ${operationResult.error}`,
      };
    }

    await writeFileAtomic(resolvedPath, operationResult.newContent, { encoding: "utf-8" });

    const diff = generateDiff(resolvedPath, originalContent, operationResult.newContent);

    return {
      success: true,
      diff,
      ...operationResult.metadata,
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const nodeError = error as { code?: string };
      if (nodeError.code === "ENOENT") {
        return {
          success: false,
          error: `${WRITE_DENIED_PREFIX} File not found: ${filePath}`,
        };
      }

      if (nodeError.code === "EACCES") {
        return {
          success: false,
          error: `${WRITE_DENIED_PREFIX} Permission denied: ${filePath}`,
        };
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `${WRITE_DENIED_PREFIX} Failed to edit file: ${message}`,
    };
  }
}
