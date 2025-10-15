import { describe, it, expect } from "bun:test";
import { createBashTool } from "./bash";
import type { BashToolArgs, BashToolResult } from "@/types/tools";
import { BASH_MAX_TOTAL_BYTES } from "@/constants/toolLimits";
import * as fs from "fs";
import { TestTempDir } from "./testHelpers";

import type { ToolCallOptions } from "ai";

// Mock ToolCallOptions for testing
const mockToolCallOptions: ToolCallOptions = {
  toolCallId: "test-call-id",
  messages: [],
};

// Helper to create bash tool with test configuration
// Returns both tool and disposable temp directory
// Use with: using testEnv = createTestBashTool();
function createTestBashTool(options?: { niceness?: number }) {
  const tempDir = new TestTempDir("test-bash");
  const tool = createBashTool({
    cwd: process.cwd(),
    tempDir: tempDir.path,
    ...options,
  });

  return {
    tool,
    [Symbol.dispose]() {
      tempDir[Symbol.dispose]();
    },
  };
}

describe("bash tool", () => {
  it("should execute a simple command successfully", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const args: BashToolArgs = {
      script: "echo hello",
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toBe("hello");
      expect(result.exitCode).toBe(0);
    }
  });

  it("should handle multi-line output", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const args: BashToolArgs = {
      script: "echo line1 && echo line2 && echo line3",
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toBe("line1\nline2\nline3");
    }
  });

  it("should fail when hard cap (300 lines) is exceeded", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const args: BashToolArgs = {
      script: "for i in {1..400}; do echo line$i; done", // Exceeds 300 line hard cap
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Line count exceeded limit");
      expect(result.error).toContain("300 lines");
      expect(result.exitCode).toBe(-1);
    }
  });

  it("should save overflow output to temp file with short ID", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const args: BashToolArgs = {
      script: "for i in {1..400}; do echo line$i; done", // Exceeds 300 line hard cap
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("[OUTPUT OVERFLOW");
      // Should contain specific overflow reason (one of the three types)
      expect(result.error).toMatch(
        /Line count exceeded limit|Total output exceeded limit|exceeded per-line limit/
      );
      expect(result.error).toContain("Full output");
      expect(result.error).toContain("lines) saved to");
      expect(result.error).toContain("bash-");
      expect(result.error).toContain(".txt");
      expect(result.error).toContain("File will be automatically cleaned up when stream ends");

      // Extract file path from error message (handles both "lines saved to" and "lines) saved to")
      const match = /saved to (\/.+?\.txt)/.exec(result.error);
      expect(match).toBeDefined();
      if (match) {
        const overflowPath = match[1];

        // Verify file has short ID format (bash-<8 hex chars>.txt)
        const filename = overflowPath.split("/").pop();
        expect(filename).toMatch(/^bash-[0-9a-f]{8}\.txt$/);

        // Verify file exists and read contents
        expect(fs.existsSync(overflowPath)).toBe(true);

        // Verify file contains collected lines (at least 300, may be slightly more)
        const fileContent = fs.readFileSync(overflowPath, "utf-8");
        const fileLines = fileContent.split("\n").filter((l: string) => l.length > 0);
        expect(fileLines.length).toBeGreaterThanOrEqual(300);
        expect(fileContent).toContain("line1");
        expect(fileContent).toContain("line300");

        // Clean up temp file
        fs.unlinkSync(overflowPath);
      }
    }
  });

  it("should fail early when hard cap is reached", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const startTime = performance.now();

    const args: BashToolArgs = {
      // This will generate 500 lines quickly - should fail at 300
      script: "for i in {1..500}; do echo line$i; done",
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;
    const duration = performance.now() - startTime;

    expect(result.success).toBe(false);
    if (!result.success) {
      // Should complete quickly since we stop at 300 lines
      expect(duration).toBeLessThan(4000);
      expect(result.error).toContain("Line count exceeded limit");
      expect(result.error).toContain("300 lines");
      expect(result.exitCode).toBe(-1);
    }
  });

  it("should truncate overflow output when overflow_policy is 'truncate'", async () => {
    const tempDir = new TestTempDir("test-bash-truncate");
    const tool = createBashTool({
      cwd: process.cwd(),
      tempDir: tempDir.path,
      overflow_policy: "truncate",
    });

    const args: BashToolArgs = {
      script: "for i in {1..400}; do echo line$i; done", // Exceeds 300 line hard cap
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      // Should contain truncation notice
      expect(result.error).toContain("[OUTPUT TRUNCATED");
      expect(result.error).toContain("Showing first 80 of");
      expect(result.error).toContain("lines:");

      // Should contain first 80 lines
      expect(result.error).toContain("line1");
      expect(result.error).toContain("line80");

      // Should NOT contain line 81 or beyond
      expect(result.error).not.toContain("line81");
      expect(result.error).not.toContain("line100");

      // Should NOT create temp file
      const files = fs.readdirSync(tempDir.path);
      const bashFiles = files.filter((f) => f.startsWith("bash-"));
      expect(bashFiles.length).toBe(0);
    }

    tempDir[Symbol.dispose]();
  });

  it("should use tmpfile policy by default when overflow_policy not specified", async () => {
    const tempDir = new TestTempDir("test-bash-default");
    const tool = createBashTool({
      cwd: process.cwd(),
      tempDir: tempDir.path,
      // overflow_policy not specified - should default to tmpfile
    });

    const args: BashToolArgs = {
      script: "for i in {1..400}; do echo line$i; done",
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      // Should use tmpfile behavior
      expect(result.error).toContain("[OUTPUT OVERFLOW");
      expect(result.error).toContain("saved to");
      expect(result.error).not.toContain("[OUTPUT TRUNCATED");

      // Verify temp file was created
      const files = fs.readdirSync(tempDir.path);
      const bashFiles = files.filter((f) => f.startsWith("bash-"));
      expect(bashFiles.length).toBe(1);
    }

    tempDir[Symbol.dispose]();
  });

  it("should interleave stdout and stderr", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const args: BashToolArgs = {
      script: "echo stdout1 && echo stderr1 >&2 && echo stdout2 && echo stderr2 >&2",
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      // Output should contain all lines interleaved
      expect(result.output).toContain("stdout1");
      expect(result.output).toContain("stderr1");
      expect(result.output).toContain("stdout2");
      expect(result.output).toContain("stderr2");
    }
  });

  it("should handle command failure with exit code", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const args: BashToolArgs = {
      script: "exit 42",
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.exitCode).toBe(42);
      expect(result.error).toContain("exited with code 42");
    }
  });

  it("should timeout long-running commands", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const args: BashToolArgs = {
      script: "while true; do sleep 0.1; done",
      timeout_secs: 1,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("timed out");
      expect(result.exitCode).toBe(-1);
    }
  });

  it("should handle empty output", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const args: BashToolArgs = {
      script: "true",
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toBe("");
      expect(result.exitCode).toBe(0);
    }
  });

  it("should complete instantly for grep-like commands (regression test)", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const startTime = performance.now();

    // This test catches the bug where readline interface close events
    // weren't firing, causing commands with minimal output to hang
    const args: BashToolArgs = {
      script: "echo 'test:first-child' | grep ':first-child'",
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;
    const duration = performance.now() - startTime;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toContain("first-child");
      expect(result.exitCode).toBe(0);
      // Should complete in well under 1 second (give 2s buffer for slow machines)
      expect(duration).toBeLessThan(2000);
    }
  });

  it("should not hang on commands that read from stdin (cat test)", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const startTime = performance.now();

    // cat without input should complete immediately
    // This used to hang because cat would wait for stdin
    const args: BashToolArgs = {
      script: "echo test | cat",
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;
    const duration = performance.now() - startTime;

    // Should complete almost instantly (not wait for timeout)
    expect(duration).toBeLessThan(4000);

    // cat with no input should succeed with empty output (stdin is closed)
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toContain("test");
      expect(duration).toBeLessThan(2000);
    }
  });

  it("should not hang on git rebase --continue", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const startTime = performance.now();

    // Extremely minimal case - just enough to trigger rebase --continue
    const script = `
      T=$(mktemp -d) && cd "$T"
      git init && git config user.email "t@t" && git config user.name "T"
      echo a > f && git add f && git commit -m a
      git checkout -b b && echo b > f && git commit -am b
      git checkout main && echo c > f && git commit -am c
      git rebase b || true
      echo resolved > f && git add f
      git rebase --continue
    `;

    const result = (await tool.execute!(
      { script, timeout_secs: 5 },
      mockToolCallOptions
    )) as BashToolResult;

    const duration = performance.now() - startTime;

    expect(duration).toBeLessThan(4000);
    expect(result).toBeDefined();
  });

  it("should work with just script and timeout", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;

    const args: BashToolArgs = {
      script: "echo test",
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toBe("test");
    }
  });

  it("should reject redundant cd to working directory with &&", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const cwd = process.cwd();

    const args: BashToolArgs = {
      script: `cd ${cwd} && echo test`,
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Redundant cd");
      expect(result.error).toContain("already runs in");
    }
  });

  it("should reject redundant cd to working directory with semicolon", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const cwd = process.cwd();

    const args: BashToolArgs = {
      script: `cd ${cwd}; echo test`,
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Redundant cd");
    }
  });

  it("should reject redundant cd with relative path (.)", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;

    const args: BashToolArgs = {
      script: "cd . && echo test",
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Redundant cd");
    }
  });

  it("should reject redundant cd with quoted path", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const cwd = process.cwd();

    const args: BashToolArgs = {
      script: `cd '${cwd}' && echo test`,
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Redundant cd");
    }
  });

  it("should allow cd to a different directory", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;

    const args: BashToolArgs = {
      script: "cd /tmp && pwd",
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toContain("/tmp");
    }
  });

  it("should allow commands that don't start with cd", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;

    const args: BashToolArgs = {
      script: "echo 'cd' && echo test",
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toContain("cd");
      expect(result.output).toContain("test");
    }
  });

  it("should complete quickly when background process is spawned", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const startTime = performance.now();

    const args: BashToolArgs = {
      // Background process that would block if we waited for it
      script: "while true; do sleep 1; done > /dev/null 2>&1 &",
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;
    const duration = performance.now() - startTime;

    expect(result.success).toBe(true);
    // Should complete in well under 1 second, not wait for infinite loop
    expect(duration).toBeLessThan(2000);
  });

  it("should complete quickly with background process and PID echo", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const startTime = performance.now();

    const args: BashToolArgs = {
      // Spawn background process, echo its PID, then exit
      // Should not wait for the background process
      script: "while true; do sleep 1; done > /dev/null 2>&1 & echo $!",
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;
    const duration = performance.now() - startTime;

    expect(result.success).toBe(true);
    if (result.success) {
      // Should output the PID
      expect(result.output).toMatch(/^\d+$/);
    }
    // Should complete quickly
    expect(duration).toBeLessThan(2000);
  });

  it("should timeout background processes that don't complete", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const startTime = performance.now();

    const args: BashToolArgs = {
      // Background process with output redirected but still blocking
      script: "while true; do sleep 0.1; done & wait",
      timeout_secs: 1,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;
    const duration = performance.now() - startTime;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("timed out");
      expect(duration).toBeLessThan(2000);
    }
  });

  it("should fail when line exceeds max line bytes", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const longLine = "x".repeat(2000);
    const args: BashToolArgs = {
      script: `echo '${longLine}'`,
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/exceeded per-line limit|OUTPUT OVERFLOW/);
      expect(result.exitCode).toBe(-1);
    }
  });

  it("should fail when total bytes limit exceeded", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const lineContent = "x".repeat(100);
    const numLines = Math.ceil(BASH_MAX_TOTAL_BYTES / 100) + 50;
    const args: BashToolArgs = {
      script: `for i in {1..${numLines}}; do echo '${lineContent}'; done`,
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/Total output exceeded limit|OUTPUT OVERFLOW/);
      expect(result.exitCode).toBe(-1);
    }
  });

  it("should fail early when byte limit is reached", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const args: BashToolArgs = {
      script: `for i in {1..1000}; do echo 'This is line number '$i' with some content'; done`,
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/Total output exceeded limit|OUTPUT OVERFLOW/);
      expect(result.exitCode).toBe(-1);
    }
  });

  it("should fail immediately when script is empty", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const args: BashToolArgs = {
      script: "",
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Script parameter is empty");
      expect(result.error).toContain("malformed tool call");
      expect(result.exitCode).toBe(-1);
      expect(result.wall_duration_ms).toBe(0);
    }
  });

  it("should fail immediately when script is only whitespace", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const args: BashToolArgs = {
      script: "   \n\t  ",
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Script parameter is empty");
      expect(result.exitCode).toBe(-1);
      expect(result.wall_duration_ms).toBe(0);
    }
  });

  it("should block sleep command at start of script", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const args: BashToolArgs = {
      script: "sleep 5",
      timeout_secs: 10,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("sleep commands are blocked");
      expect(result.error).toContain("polling loops");
      expect(result.error).toContain("while ! condition");
      expect(result.exitCode).toBe(-1);
      expect(result.wall_duration_ms).toBe(0);
    }
  });

  it("should allow sleep in polling loops", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const args: BashToolArgs = {
      script: "for i in 1 2 3; do echo $i; sleep 0.1; done",
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toContain("1");
      expect(result.output).toContain("2");
      expect(result.output).toContain("3");
    }
  });

  it("should use default timeout (3s) when timeout_secs is undefined", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const args = {
      script: "echo hello",
      timeout_secs: undefined,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toBe("hello");
      expect(result.exitCode).toBe(0);
    }
  });

  it("should use default timeout (3s) when timeout_secs is omitted", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;
    const args = {
      script: "echo hello",
      // timeout_secs omitted entirely
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toBe("hello");
      expect(result.exitCode).toBe(0);
    }
  });

  // Note: Zero and negative timeout_secs are rejected by Zod schema validation
  // before reaching the execute function, so these cases are handled at the schema level
});

describe("niceness parameter", () => {
  it("should execute complex multi-line scripts with niceness", async () => {
    using testEnv = createTestBashTool({ niceness: 19 });
    const tool = testEnv.tool;

    // Complex script with conditionals, similar to GIT_STATUS_SCRIPT
    const args: BashToolArgs = {
      script: `
# Test complex script with conditionals
VALUE=$(echo "test")

if [ -z "$VALUE" ]; then
  echo "ERROR: Value is empty"
  exit 1
fi

# Another conditional check
RESULT=$(echo "success")
if [ $? -ne 0 ]; then
  echo "ERROR: Command failed"
  exit 2
fi

echo "---OUTPUT---"
echo "$VALUE"
echo "$RESULT"
`,
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toContain("---OUTPUT---");
      expect(result.output).toContain("test");
      expect(result.output).toContain("success");
      expect(result.exitCode).toBe(0);
    }
  });

  it("should handle exit codes correctly with niceness", async () => {
    using testEnv = createTestBashTool({ niceness: 19 });
    const tool = testEnv.tool;

    // Script that should exit with code 2
    const args: BashToolArgs = {
      script: `
RESULT=$(false)
if [ $? -ne 0 ]; then
  echo "Command failed as expected"
  exit 2
fi
`,
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    expect(result.exitCode).toBe(2);
    // Error message includes stderr output
    if (!result.success) {
      expect(result.error).toMatch(/Command failed as expected|Command exited with code 2/);
    }
  });

  it("should execute simple commands with niceness", async () => {
    using testEnv = createTestBashTool({ niceness: 10 });
    const tool = testEnv.tool;
    const args: BashToolArgs = {
      script: "echo hello",
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toBe("hello");
      expect(result.exitCode).toBe(0);
    }
  });

  it("should not create zombie processes when spawning background tasks", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;

    // Spawn a background sleep process that would become a zombie if not cleaned up
    // Use a unique marker to identify our test process
    // Note: Start with echo to avoid triggering standalone sleep blocker
    const marker = `zombie-test-${Date.now()}`;
    const args: BashToolArgs = {
      script: `echo "${marker}"; sleep 100 & echo $!`,
      timeout_secs: 1,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    // Tool should complete successfully
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toContain(marker);
      const lines = result.output.split("\n");
      const bgPid = lines[1]; // Second line should be the background PID

      // Give a moment for cleanup to happen
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify the background process was killed (process group cleanup)
      using checkEnv = createTestBashTool();
      const checkResult = (await checkEnv.tool.execute!(
        {
          script: `ps -p ${bgPid} > /dev/null 2>&1 && echo "ALIVE" || echo "DEAD"`,
          timeout_secs: 1,
        },
        mockToolCallOptions
      )) as BashToolResult;

      expect(checkResult.success).toBe(true);
      if (checkResult.success) {
        expect(checkResult.output).toBe("DEAD");
      }
    }
  });

  it("should kill all processes when aborted via AbortController", async () => {
    using testEnv = createTestBashTool();
    const tool = testEnv.tool;

    // Create AbortController to simulate user interruption
    const abortController = new AbortController();

    // Use unique token to identify our test processes
    const token = `test-abort-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Spawn a command that creates child processes (simulating cargo build)
    const args: BashToolArgs = {
      script: `
        # Simulate cargo spawning rustc processes
        for i in {1..5}; do
          (echo "child-\${i}"; exec -a "sleep-${token}" sleep 100) &
          echo "SPAWNED:$!"
        done
        echo "ALL_SPAWNED"
        # Wait so we can abort while children are running
        exec -a "sleep-${token}" sleep 100
      `,
      timeout_secs: 10,
    };

    // Start the command
    const resultPromise = tool.execute!(args, {
      ...mockToolCallOptions,
      abortSignal: abortController.signal,
    }) as Promise<BashToolResult>;

    // Wait for children to spawn
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Abort the operation (simulating Ctrl+C)
    abortController.abort();

    // Wait for the result
    const result = await resultPromise;

    // Command should be aborted
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("aborted");
    }

    // Wait for all processes to be cleaned up (SIGKILL needs time to propagate in CI)
    // Retry with exponential backoff instead of fixed wait
    // Use ps + grep to avoid pgrep matching itself
    let remainingProcesses = -1;
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));

      using checkEnv = createTestBashTool();
      const checkResult = (await checkEnv.tool.execute!(
        {
          script: `ps aux | grep "${token}" | grep -v grep | wc -l`,
          timeout_secs: 1,
        },
        mockToolCallOptions
      )) as BashToolResult;

      expect(checkResult.success).toBe(true);
      if (checkResult.success) {
        remainingProcesses = parseInt(checkResult.output.trim());
        if (remainingProcesses === 0) {
          break;
        }
      }
    }

    expect(remainingProcesses).toBe(0);
  });
});
