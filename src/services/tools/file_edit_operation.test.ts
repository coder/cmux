import { describe, test, expect } from "@jest/globals";
import { executeFileEditOperation } from "./file_edit_operation";
import { WRITE_DENIED_PREFIX } from "@/types/tools";
import { createRuntime } from "@/runtime/runtimeFactory";

const TEST_CWD = "/tmp";

function createConfig() {
  return {
    cwd: TEST_CWD,
    runtime: createRuntime({ type: "local", workdir: TEST_CWD }),
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
});
