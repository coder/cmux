import { describe, it, expect } from "bun:test";
import { createBashTool } from "./bash";
import type { BashToolArgs, BashToolResult } from "@/types/tools";
import { BASH_MAX_TOTAL_BYTES } from "@/constants/toolLimits";
import * as fs from "fs";

import type { ToolCallOptions } from "ai";

// Mock ToolCallOptions for testing
const mockToolCallOptions: ToolCallOptions = {
  toolCallId: "test-call-id",
  messages: [],
};

describe("bash tool", () => {
  it("should execute a simple command successfully", async () => {
    const tool = createBashTool({ cwd: process.cwd() });
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
    const tool = createBashTool({ cwd: process.cwd() });
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
    const tool = createBashTool({ cwd: process.cwd() });
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
    const tool = createBashTool({ cwd: process.cwd() });
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
      expect(result.error).toContain("When done, clean up: rm");

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
    const tool = createBashTool({ cwd: process.cwd() });
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

  it("should interleave stdout and stderr", async () => {
    const tool = createBashTool({ cwd: process.cwd() });
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
    const tool = createBashTool({ cwd: process.cwd() });
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
    const tool = createBashTool({ cwd: process.cwd() });
    const args: BashToolArgs = {
      script: "sleep 10",
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
    const tool = createBashTool({ cwd: process.cwd() });
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
    const tool = createBashTool({ cwd: process.cwd() });
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
    const tool = createBashTool({ cwd: process.cwd() });
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
    const tool = createBashTool({ cwd: process.cwd() });
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
    const tool = createBashTool({ cwd: process.cwd() });

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
    const tool = createBashTool({ cwd: process.cwd() });
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
    const tool = createBashTool({ cwd: process.cwd() });
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
    const tool = createBashTool({ cwd: process.cwd() });

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
    const tool = createBashTool({ cwd: process.cwd() });
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
    const tool = createBashTool({ cwd: process.cwd() });

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
    const tool = createBashTool({ cwd: process.cwd() });

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
    const tool = createBashTool({ cwd: process.cwd() });
    const startTime = performance.now();

    const args: BashToolArgs = {
      // Background process that would block if we waited for it
      script: "sleep 100 > /dev/null 2>&1 &",
      timeout_secs: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;
    const duration = performance.now() - startTime;

    expect(result.success).toBe(true);
    // Should complete in well under 1 second, not wait for sleep 100
    expect(duration).toBeLessThan(2000);
  });

  it("should complete quickly with background process and PID echo", async () => {
    const tool = createBashTool({ cwd: process.cwd() });
    const startTime = performance.now();

    const args: BashToolArgs = {
      // Spawn background process, echo its PID, then exit
      // Should not wait for the background process
      script: "sleep 100 > /dev/null 2>&1 & echo $!",
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
    const tool = createBashTool({ cwd: process.cwd() });
    const startTime = performance.now();

    const args: BashToolArgs = {
      // Background process with output redirected but still blocking
      script: "sleep 10 & wait",
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
    const tool = createBashTool({ cwd: process.cwd() });
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
    const tool = createBashTool({ cwd: process.cwd() });
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
    const tool = createBashTool({ cwd: process.cwd() });
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
    const tool = createBashTool({ cwd: process.cwd() });
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
    const tool = createBashTool({ cwd: process.cwd() });
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

  it("should fail immediately when timeout_secs is undefined", async () => {
    const tool = createBashTool({ cwd: process.cwd() });
    const args = {
      script: "echo hello",
      timeout_secs: undefined,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("timeout_secs parameter is missing or invalid");
      expect(result.error).toContain("malformed tool call");
      expect(result.exitCode).toBe(-1);
      expect(result.wall_duration_ms).toBe(0);
    }
  });

  it("should fail immediately when timeout_secs is null", async () => {
    const tool = createBashTool({ cwd: process.cwd() });
    const args = {
      script: "echo hello",
      timeout_secs: null as unknown as number,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("timeout_secs parameter is missing or invalid");
      expect(result.error).toContain("malformed tool call");
      expect(result.exitCode).toBe(-1);
      expect(result.wall_duration_ms).toBe(0);
    }
  });

  it("should fail immediately when timeout_secs is zero", async () => {
    const tool = createBashTool({ cwd: process.cwd() });
    const args: BashToolArgs = {
      script: "echo hello",
      timeout_secs: 0,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("timeout_secs parameter is missing or invalid");
      expect(result.error).toContain("malformed tool call");
      expect(result.exitCode).toBe(-1);
      expect(result.wall_duration_ms).toBe(0);
    }
  });

  it("should fail immediately when timeout_secs is negative", async () => {
    const tool = createBashTool({ cwd: process.cwd() });
    const args: BashToolArgs = {
      script: "echo hello",
      timeout_secs: -5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("timeout_secs parameter is missing or invalid");
      expect(result.error).toContain("malformed tool call");
      expect(result.exitCode).toBe(-1);
      expect(result.wall_duration_ms).toBe(0);
    }
  });
});

describe("niceness parameter", () => {
  it("should execute complex multi-line scripts with niceness", async () => {
    const tool = createBashTool({ cwd: process.cwd(), niceness: 19 });

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
    const tool = createBashTool({ cwd: process.cwd(), niceness: 19 });

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
    const tool = createBashTool({ cwd: process.cwd(), niceness: 10 });
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
});
