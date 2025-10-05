import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { createFileReadTool } from "./file_read";
import type { FileReadToolArgs, FileReadToolResult } from "../../types/tools";
import type { ToolCallOptions } from "ai";

// Mock ToolCallOptions for testing
const mockToolCallOptions: ToolCallOptions = {
  toolCallId: "test-call-id",
  messages: [],
};

describe("file_read tool", () => {
  let testDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    // Create a temporary directory for test files
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "fileRead-test-"));
    testFilePath = path.join(testDir, "test.txt");
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should read entire file with line numbers", async () => {
    // Setup
    const content = "line one\nline two\nline three";
    await fs.writeFile(testFilePath, content);

    const tool = createFileReadTool({ cwd: testDir });
    const args: FileReadToolArgs = {
      filePath: testFilePath,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileReadToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.lines_read).toBe(3);
      expect(result.content).toBe("1\tline one\n2\tline two\n3\tline three");
      expect(result.file_size).toBeGreaterThan(0);
      expect(result.lease).toMatch(/^[0-9a-f]{6}$/);
    }
  });

  it("should read file with offset", async () => {
    // Setup
    const content = "line1\nline2\nline3\nline4\nline5";
    await fs.writeFile(testFilePath, content);

    const tool = createFileReadTool({ cwd: testDir });
    const args: FileReadToolArgs = {
      filePath: testFilePath,
      offset: 3, // Start from line 3
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileReadToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.lines_read).toBe(3);
      expect(result.content).toBe("3\tline3\n4\tline4\n5\tline5");
      expect(result.lease).toMatch(/^[0-9a-f]{6}$/);
    }
  });

  it("should read file with limit", async () => {
    // Setup
    const content = "line1\nline2\nline3\nline4\nline5";
    await fs.writeFile(testFilePath, content);

    const tool = createFileReadTool({ cwd: testDir });
    const args: FileReadToolArgs = {
      filePath: testFilePath,
      limit: 2, // Read only first 2 lines
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileReadToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.lines_read).toBe(2);
      expect(result.content).toBe("1\tline1\n2\tline2");
      expect(result.lease).toMatch(/^[0-9a-f]{6}$/);
    }
  });

  it("should read file with offset and limit", async () => {
    // Setup
    const content = "line1\nline2\nline3\nline4\nline5";
    await fs.writeFile(testFilePath, content);

    const tool = createFileReadTool({ cwd: testDir });
    const args: FileReadToolArgs = {
      filePath: testFilePath,
      offset: 2, // Start from line 2
      limit: 2, // Read 2 lines
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileReadToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.lines_read).toBe(2);
      expect(result.content).toBe("2\tline2\n3\tline3");
      expect(result.lease).toMatch(/^[0-9a-f]{6}$/);
    }
  });

  it("should handle single line file", async () => {
    // Setup
    const content = "single line";
    await fs.writeFile(testFilePath, content);

    const tool = createFileReadTool({ cwd: testDir });
    const args: FileReadToolArgs = {
      filePath: testFilePath,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileReadToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.lines_read).toBe(1);
      expect(result.content).toBe("1\tsingle line");
      expect(result.lease).toMatch(/^[0-9a-f]{6}$/);
    }
  });

  it("should handle empty file", async () => {
    // Setup
    await fs.writeFile(testFilePath, "");

    const tool = createFileReadTool({ cwd: testDir });
    const args: FileReadToolArgs = {
      filePath: testFilePath,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileReadToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.lines_read).toBe(0);
      expect(result.content).toBe("");
      expect(result.lease).toMatch(/^[0-9a-f]{6}$/);
    }
  });

  it("should fail when file does not exist", async () => {
    // Setup
    const nonExistentPath = path.join(testDir, "nonexistent.txt");

    const tool = createFileReadTool({ cwd: testDir });
    const args: FileReadToolArgs = {
      filePath: nonExistentPath,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileReadToolResult;

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("File not found");
    }
  });

  it("should fail when offset is invalid", async () => {
    // Setup
    const content = "line1\nline2";
    await fs.writeFile(testFilePath, content);

    const tool = createFileReadTool({ cwd: testDir });
    const args: FileReadToolArgs = {
      filePath: testFilePath,
      offset: 10, // Beyond file length
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileReadToolResult;

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("beyond file length");
    }
  });

  it("should truncate lines longer than 1024 bytes", async () => {
    // Setup - create a line with more than 1024 bytes
    const longLine = "x".repeat(2000);
    const content = `short line\n${longLine}\nanother short line`;
    await fs.writeFile(testFilePath, content);

    const tool = createFileReadTool({ cwd: testDir });
    const args: FileReadToolArgs = {
      filePath: testFilePath,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileReadToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.lines_read).toBe(3);
      const lines = result.content.split("\n");
      expect(lines[0]).toBe("1\tshort line");
      expect(lines[1]).toContain("... [truncated]");
      expect(Buffer.byteLength(lines[1], "utf-8")).toBeLessThan(1100); // Should be around 1024 + prefix + truncation marker
      expect(lines[2]).toBe("3\tanother short line");
      expect(result.lease).toMatch(/^[0-9a-f]{6}$/);
    }
  });

  it("should fail when reading more than 1000 lines", async () => {
    // Setup - create a file with 1001 lines
    const lines = Array.from({ length: 1001 }, (_, i) => `line${i + 1}`);
    const content = lines.join("\n");
    await fs.writeFile(testFilePath, content);

    const tool = createFileReadTool({ cwd: testDir });
    const args: FileReadToolArgs = {
      filePath: testFilePath,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileReadToolResult;

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("1000 lines");
      expect(result.error).toContain("read less at a time");
    }
  });

  it("should fail when total output exceeds 16KB", async () => {
    // Setup - create lines that together exceed 16KB
    // Each line is about 200 bytes, so 100 lines will exceed 16KB
    const lines = Array.from({ length: 100 }, (_, i) => `line${i + 1}:${"x".repeat(200)}`);
    const content = lines.join("\n");
    await fs.writeFile(testFilePath, content);

    const tool = createFileReadTool({ cwd: testDir });
    const args: FileReadToolArgs = {
      filePath: testFilePath,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileReadToolResult;

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("16384 bytes");
      expect(result.error).toContain("read less at a time");
    }
  });

  it("should allow reading with limit to stay under 1000 lines", async () => {
    // Setup - create a file with 1001 lines
    const lines = Array.from({ length: 1001 }, (_, i) => `line${i + 1}`);
    const content = lines.join("\n");
    await fs.writeFile(testFilePath, content);

    const tool = createFileReadTool({ cwd: testDir });
    const args: FileReadToolArgs = {
      filePath: testFilePath,
      limit: 500, // Read only 500 lines
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileReadToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.lines_read).toBe(500);
      expect(result.lease).toMatch(/^[0-9a-f]{6}$/);
    }
  });

  it("should reject reading files outside cwd using ..", async () => {
    // Setup - create a file in testDir
    const content = "secret content";
    await fs.writeFile(testFilePath, content);

    // Create a subdirectory
    const subDir = path.join(testDir, "subdir");
    await fs.mkdir(subDir);

    // Try to read file outside cwd by going up
    const tool = createFileReadTool({ cwd: subDir });
    const args: FileReadToolArgs = {
      filePath: "../test.txt", // This goes outside subDir back to testDir
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileReadToolResult;

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("restricted to the workspace directory");
      expect(result.error).toContain("ask the user for permission");
    }
  });

  it("should reject reading absolute paths outside cwd", async () => {
    // Setup
    const tool = createFileReadTool({ cwd: testDir });
    const args: FileReadToolArgs = {
      filePath: "/etc/passwd", // Absolute path outside cwd
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileReadToolResult;

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("restricted to the workspace directory");
    }
  });

  it("should allow reading files with relative paths within cwd", async () => {
    // Setup - create a subdirectory and file
    const subDir = path.join(testDir, "subdir");
    await fs.mkdir(subDir);
    const subFilePath = path.join(subDir, "test.txt");
    const content = "content in subdir";
    await fs.writeFile(subFilePath, content);

    // Read using relative path from cwd
    const tool = createFileReadTool({ cwd: testDir });
    const args: FileReadToolArgs = {
      filePath: "subdir/test.txt",
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileReadToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.content).toContain("content in subdir");
    }
  });
});
