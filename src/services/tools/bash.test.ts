import { describe, it, expect } from "bun:test";
import { createBashTool } from "./bash";
import type { BashToolArgs, BashToolResult } from "@/types/tools";
import { BASH_HARD_MAX_LINES, BASH_MAX_TOTAL_BYTES } from "@/constants/toolLimits";

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
      max_lines: 100,
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
      max_lines: 100,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toBe("line1\nline2\nline3");
    }
  });

  it("should fail when max_lines is exceeded", async () => {
    const tool = createBashTool({ cwd: process.cwd() });
    const args: BashToolArgs = {
      script: "for i in {1..10}; do echo line$i; done",
      timeout_secs: 5,
      max_lines: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("output exceeded limits");
      expect(result.exitCode).toBe(-1);
    }
  });

  it("should fail early when max_lines is reached", async () => {
    const tool = createBashTool({ cwd: process.cwd() });
    const startTime = performance.now();

    const args: BashToolArgs = {
      // This command would take ~10 seconds if it ran to completion
      script: "for i in {1..100}; do echo line$i; sleep 0.1; done",
      timeout_secs: 20,
      max_lines: 3,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;
    const duration = performance.now() - startTime;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("output exceeded limits");
      // Should complete much faster than 10 seconds (give it 2 seconds buffer)
      expect(duration).toBeLessThan(2000);
    }
  });

  it("should interleave stdout and stderr", async () => {
    const tool = createBashTool({ cwd: process.cwd() });
    const args: BashToolArgs = {
      script: "echo stdout1 && echo stderr1 >&2 && echo stdout2 && echo stderr2 >&2",
      timeout_secs: 5,
      max_lines: 100,
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
      max_lines: 100,
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
      max_lines: 100,
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
      max_lines: 100,
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
      max_lines: 100,
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
      max_lines: 100,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;
    const duration = performance.now() - startTime;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toContain("test");
      expect(duration).toBeLessThan(2000);
    }
  });

  it("should not hang on git rebase --continue", async () => {
    const tool = createBashTool({ cwd: process.cwd() });
    const startTime = performance.now();

    // git rebase --continue with no rebase in progress should fail immediately
    // This test ensures that git commands don't try to open an editor
    const args: BashToolArgs = {
      script: "git rebase --continue 2>&1 || true",
      timeout_secs: 5,
      max_lines: 100,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;
    const duration = performance.now() - startTime;

    expect(result.success).toBe(true);
    // Should complete quickly without hanging on editor
    expect(duration).toBeLessThan(2000);
  });

  it("should accept stdin input and avoid shell escaping issues", async () => {
    const tool = createBashTool({ cwd: process.cwd() });
    const complexInput = "test'with\"quotes\nand$variables";

    const args: BashToolArgs = {
      script: "cat",
      timeout_secs: 5,
      max_lines: 100,
      stdin: complexInput,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toBe(complexInput);
    }
  });

  it("should handle multi-line stdin input", async () => {
    const tool = createBashTool({ cwd: process.cwd() });
    const multiLineInput = "line1\nline2\nline3";

    const args: BashToolArgs = {
      script: "cat",
      timeout_secs: 5,
      max_lines: 100,
      stdin: multiLineInput,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toBe(multiLineInput);
    }
  });

  it("should work without stdin when not provided (backward compatibility)", async () => {
    const tool = createBashTool({ cwd: process.cwd() });

    const args: BashToolArgs = {
      script: "echo test",
      timeout_secs: 5,
      max_lines: 100,
      // stdin not provided
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
      max_lines: 100,
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
      max_lines: 100,
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
      max_lines: 100,
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
      max_lines: 100,
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
      max_lines: 100,
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
      max_lines: 100,
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
      max_lines: 100,
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
      max_lines: 100,
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
      max_lines: 100,
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
      max_lines: 10,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("output exceeded limits");
      expect(result.error).toContain("head");
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
      max_lines: BASH_HARD_MAX_LINES,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("output exceeded limits");
      expect(result.error).toContain("grep");
      expect(result.exitCode).toBe(-1);
    }
  });

  it("should fail early when byte limit is reached", async () => {
    const tool = createBashTool({ cwd: process.cwd() });
    const args: BashToolArgs = {
      script: `for i in {1..1000}; do echo 'This is line number '$i' with some content'; done`,
      timeout_secs: 5,
      max_lines: BASH_HARD_MAX_LINES,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("output exceeded limits");
      expect(result.error).toContain("tail");
      expect(result.exitCode).toBe(-1);
    }
  });
});
