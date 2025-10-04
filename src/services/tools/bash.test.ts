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
});
