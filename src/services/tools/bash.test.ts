import { describe, it, expect } from "bun:test";
import { createBashTool } from "./bash";
import type { BashToolArgs, BashToolResult } from "../../types/tools";
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
      expect(result.truncated).toBeUndefined();
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
      expect(result.truncated).toBeUndefined();
    }
  });

  it("should truncate output when max_lines is exceeded", async () => {
    const tool = createBashTool({ cwd: process.cwd() });
    const args: BashToolArgs = {
      script: "for i in {1..10}; do echo line$i; done",
      timeout_secs: 5,
      max_lines: 5,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      const lines = result.output.split("\n");
      // Should have 5 lines plus the truncation marker on the last line
      expect(lines.length).toBe(5);
      expect(result.output).toContain("[TRUNCATED]");
      expect(result.truncated).toBe(true);
    }
  });

  it("should kill process early when max_lines is reached", async () => {
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

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.truncated).toBe(true);
      expect(result.output).toContain("[TRUNCATED]");
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

  it("should add truncation marker only when output is truncated", async () => {
    const tool = createBashTool({ cwd: process.cwd() });
    const args: BashToolArgs = {
      script: "echo line1 && echo line2",
      timeout_secs: 5,
      max_lines: 10,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).not.toContain("[TRUNCATED]");
      expect(result.truncated).toBeUndefined();
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

  it("should properly clean up process resources", async () => {
    const tool = createBashTool({ cwd: process.cwd() });
    const args: BashToolArgs = {
      script: "for i in {1..100}; do echo line$i; sleep 0.1; done",
      timeout_secs: 10,
      max_lines: 2,
    };

    // This test verifies that the process is properly disposed
    // by completing quickly when max_lines is hit
    const startTime = performance.now();
    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;
    const duration = performance.now() - startTime;

    expect(result).toBeDefined();
    expect(result.truncated).toBe(true);
    // Should complete quickly, not wait for the full command
    expect(duration).toBeLessThan(2000);
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

    // cat without arguments reads from stdin. With stdin properly closed/ignored,
    // it should fail immediately instead of hanging waiting for input
    const args: BashToolArgs = {
      script: "cat",
      timeout_secs: 5,
      max_lines: 100,
    };

    const result = (await tool.execute!(args, mockToolCallOptions)) as BashToolResult;
    const duration = performance.now() - startTime;

    // Should complete almost instantly (not wait for timeout)
    expect(duration).toBeLessThan(2000);

    // cat with no input should succeed with empty output (stdin is closed)
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.output).toBe("");
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
      { script, timeout_secs: 2, max_lines: 100 },
      mockToolCallOptions
    )) as BashToolResult;

    const duration = performance.now() - startTime;

    expect(duration).toBeLessThan(2000);
    expect(result).toBeDefined();
  });
});
