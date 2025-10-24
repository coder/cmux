import { describe, test, expect, beforeEach } from "@jest/globals";
import { LocalRuntime } from "@/runtime/LocalRuntime";
import { createRuntime } from "@/runtime/runtimeFactory";
>>>>>>> a522bfce (🤖 Integrate runtime config with workspace metadata and AIService)

const TEST_CWD = "/tmp";

function createConfig() {
  return { cwd: TEST_CWD, runtime: createRuntime({ type: "local", workdir: TEST_CWD }), tempDir: "/tmp" };
}

describe("executeFileEditOperation", () => {
  it("should return error when path validation fails", async () => {
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
