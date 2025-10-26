import { describe, test, expect, jest } from "@jest/globals";
import { executeFileEditOperation } from "./file_edit_operation";
import { WRITE_DENIED_PREFIX } from "@/types/tools";
import { createRuntime } from "@/runtime/runtimeFactory";
import type { Runtime } from "@/runtime/Runtime";

const TEST_CWD = "/tmp";

function createConfig(runtime?: Runtime) {
  return {
    cwd: TEST_CWD,
    runtime: runtime ?? createRuntime({ type: "local", srcBaseDir: TEST_CWD }),
    tempDir: "/tmp",
  };
}

describe("executeFileEditOperation", () => {
  test("should return error when path validation fails", async () => {
    const result = await executeFileEditOperation({
      config: createConfig(),
      filePath: "../../etc/passwd",
      operation: () => ({ success: true, newContent: "", metadata: {} }),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.startsWith(WRITE_DENIED_PREFIX)).toBe(true);
    }
  });

  test("should use runtime.normalizePath for path resolution, not Node's path.resolve", async () => {
    // This test exposes a bug where file_edit_operation.ts uses path.resolve()
    // instead of runtime.normalizePath() for resolving file paths.
    // 
    // The bug: path.resolve() uses LOCAL filesystem semantics (Node.js path module),
    // which normalizes paths differently than the remote filesystem expects.
    // For example, path.resolve() on Windows uses backslashes, and path normalization
    // can behave differently across platforms.
    
    const normalizePathCalls: Array<{ targetPath: string; basePath: string }> = [];
    
    const mockRuntime = {
      stat: jest.fn<() => Promise<never>>().mockRejectedValue(new Error("File not found")),
      normalizePath: jest.fn<(targetPath: string, basePath: string) => string>((targetPath: string, basePath: string) => {
        normalizePathCalls.push({ targetPath, basePath });
        // Mock SSH-style path normalization
        if (targetPath.startsWith("/")) return targetPath;
        return `${basePath}/${targetPath}`;
      }),
    } as unknown as Runtime;

    const testFilePath = "relative/path/to/file.txt";
    const testCwd = "/remote/workspace/dir";

    await executeFileEditOperation({
      config: {
        cwd: testCwd,
        runtime: mockRuntime,
        tempDir: "/tmp",
      },
      filePath: testFilePath,
      operation: () => ({ success: true, newContent: "test", metadata: {} }),
    });

    // BUG: The code uses path.resolve() directly instead of runtime.normalizePath()
    // This means path resolution uses LOCAL filesystem semantics instead of runtime-specific logic
    
    // Check if normalizePath was called for path resolution
    const normalizeCallForFilePath = normalizePathCalls.find(
      (call) => call.targetPath === testFilePath
    );
    
    // This will FAIL because file_edit_operation.ts doesn't use runtime.normalizePath()
    // for resolving the file path - it uses path.resolve() directly
    expect(normalizeCallForFilePath).toBeDefined();
    
    if (normalizeCallForFilePath) {
      expect(normalizeCallForFilePath.basePath).toBe(testCwd);
    }
  });
});
