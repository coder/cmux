import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { createFileEditInsertTool } from "./file_edit_insert";
import type { FileEditInsertToolArgs, FileEditInsertToolResult } from "@/types/tools";
import type { ToolCallOptions } from "ai";
import { TestTempDir, getTestDeps } from "./testHelpers";
import { createRuntime } from "@/runtime/runtimeFactory";

// Mock ToolCallOptions for testing
const mockToolCallOptions: ToolCallOptions = {
  toolCallId: "test-call-id",
  messages: [],
};

// Helper to create file_edit_insert tool with test configuration
// Returns both tool and disposable temp directory
function createTestFileEditInsertTool(options?: { cwd?: string }) {
  const tempDir = new TestTempDir("test-file-edit-insert");
  const tool = createFileEditInsertTool({
    ...getTestDeps(),
    cwd: options?.cwd ?? process.cwd(),
    runtime: createRuntime({ type: "local", srcBaseDir: "/tmp" }),
    runtimeTempDir: tempDir.path,
  });

  return {
    tool,
    [Symbol.dispose]() {
      tempDir[Symbol.dispose]();
    },
  };
}

describe("file_edit_insert tool", () => {
  let testDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    // Create a temporary directory for test files
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "fileEditInsert-test-"));
    testFilePath = path.join(testDir, "test.txt");
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should insert content at the top of the file (line_offset = 0)", async () => {
    // Setup
    const initialContent = "line1\nline2\nline3";
    await fs.writeFile(testFilePath, initialContent);

    using testEnv = createTestFileEditInsertTool({ cwd: testDir });
    const tool = testEnv.tool;
    const args: FileEditInsertToolArgs = {
      file_path: "test.txt", // Use relative path
      line_offset: 0,
      content: "INSERTED",
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(true);

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("INSERTED\nline1\nline2\nline3");
  });

  it("should insert content after line 1 (line_offset = 1)", async () => {
    // Setup
    const initialContent = "line1\nline2\nline3";
    await fs.writeFile(testFilePath, initialContent);

    using testEnv = createTestFileEditInsertTool({ cwd: testDir });
    const tool = testEnv.tool;
    const args: FileEditInsertToolArgs = {
      file_path: "test.txt", // Use relative path
      line_offset: 1,
      content: "INSERTED",
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(true);

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("line1\nINSERTED\nline2\nline3");
  });

  it("should insert content after line 2 (line_offset = 2)", async () => {
    // Setup
    const initialContent = "line1\nline2\nline3";
    await fs.writeFile(testFilePath, initialContent);

    using testEnv = createTestFileEditInsertTool({ cwd: testDir });
    const tool = testEnv.tool;
    const args: FileEditInsertToolArgs = {
      file_path: "test.txt", // Use relative path
      line_offset: 2,
      content: "INSERTED",
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(true);

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("line1\nline2\nINSERTED\nline3");
  });

  it("should insert content at the end of the file (line_offset = line count)", async () => {
    // Setup
    const initialContent = "line1\nline2\nline3";
    await fs.writeFile(testFilePath, initialContent);

    using testEnv = createTestFileEditInsertTool({ cwd: testDir });
    const tool = testEnv.tool;
    const args: FileEditInsertToolArgs = {
      file_path: "test.txt", // Use relative path
      line_offset: 3,
      content: "INSERTED",
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(true);

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("line1\nline2\nline3\nINSERTED");
  });

  it("should insert multiline content", async () => {
    // Setup
    const initialContent = "line1\nline2";
    await fs.writeFile(testFilePath, initialContent);

    using testEnv = createTestFileEditInsertTool({ cwd: testDir });
    const tool = testEnv.tool;
    const args: FileEditInsertToolArgs = {
      file_path: "test.txt", // Use relative path
      line_offset: 1,
      content: "INSERTED1\nINSERTED2",
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(true);

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("line1\nINSERTED1\nINSERTED2\nline2");
  });

  it("should insert content into empty file", async () => {
    // Setup
    await fs.writeFile(testFilePath, "");

    using testEnv = createTestFileEditInsertTool({ cwd: testDir });
    const tool = testEnv.tool;
    const args: FileEditInsertToolArgs = {
      file_path: "test.txt", // Use relative path
      line_offset: 0,
      content: "INSERTED",
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(true);

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("INSERTED\n");
  });

  it("should fail when file does not exist and create is not set", async () => {
    // Setup
    using testEnv = createTestFileEditInsertTool({ cwd: testDir });
    const tool = testEnv.tool;
    const args: FileEditInsertToolArgs = {
      file_path: "nonexistent.txt", // Use relative path
      line_offset: 0,
      content: "INSERTED",
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("File not found");
      expect(result.error).toContain("set create: true");
    }
  });

  it("should create file when create is true and file does not exist", async () => {
    // Setup
    const tool = createFileEditInsertTool({
      ...getTestDeps(),
      cwd: testDir,
      runtime: createRuntime({ type: "local", srcBaseDir: "/tmp" }),
      runtimeTempDir: "/tmp",
    });
    const args: FileEditInsertToolArgs = {
      file_path: "newfile.txt", // Use relative path
      line_offset: 0,
      content: "INSERTED",
      create: true,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(true);

    const fileContent = await fs.readFile(path.join(testDir, "newfile.txt"), "utf-8");
    expect(fileContent).toBe("INSERTED\n");
  });

  it("should create parent directories when create is true", async () => {
    // Setup
    const tool = createFileEditInsertTool({
      ...getTestDeps(),
      cwd: testDir,
      runtime: createRuntime({ type: "local", srcBaseDir: "/tmp" }),
      runtimeTempDir: "/tmp",
    });
    const args: FileEditInsertToolArgs = {
      file_path: "nested/dir/newfile.txt", // Use relative path
      line_offset: 0,
      content: "INSERTED",
      create: true,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(true);

    const fileContent = await fs.readFile(path.join(testDir, "nested/dir/newfile.txt"), "utf-8");
    expect(fileContent).toBe("INSERTED\n");
  });

  it("should work normally with create: true when file already exists", async () => {
    // Setup
    const initialContent = "line1\nline2";
    await fs.writeFile(testFilePath, initialContent);

    const tool = createFileEditInsertTool({
      ...getTestDeps(),
      cwd: testDir,
      runtime: createRuntime({ type: "local", srcBaseDir: "/tmp" }),
      runtimeTempDir: "/tmp",
    });
    const args: FileEditInsertToolArgs = {
      file_path: "test.txt", // Use relative path
      line_offset: 1,
      content: "INSERTED",
      create: true,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(true);

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("line1\nINSERTED\nline2");
  });

  it("should fail when line_offset is negative", async () => {
    // Setup
    const initialContent = "line1\nline2";
    await fs.writeFile(testFilePath, initialContent);

    using testEnv = createTestFileEditInsertTool({ cwd: testDir });
    const tool = testEnv.tool;
    const args: FileEditInsertToolArgs = {
      file_path: "test.txt", // Use relative path
      line_offset: -1,
      content: "INSERTED",
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("must be non-negative");
    }
  });

  it("should fail when line_offset exceeds file length", async () => {
    // Setup
    const initialContent = "line1\nline2";
    await fs.writeFile(testFilePath, initialContent);

    using testEnv = createTestFileEditInsertTool({ cwd: testDir });
    const tool = testEnv.tool;
    const args: FileEditInsertToolArgs = {
      file_path: "test.txt", // Use relative path
      line_offset: 10, // File only has 2 lines
      content: "INSERTED",
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("beyond file length");
    }
  });

  it("should handle content with trailing newline correctly (no double newlines)", async () => {
    // This test verifies the fix for the terminal-bench "hello-world" bug
    // where content with \n at the end was getting an extra newline added
    using testEnv = createTestFileEditInsertTool({ cwd: testDir });
    const tool = testEnv.tool;
    const args: FileEditInsertToolArgs = {
      file_path: "newfile.txt",
      line_offset: 0,
      content: "Hello, world!\n", // Content already has trailing newline
      create: true,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(true);

    const fileContent = await fs.readFile(path.join(testDir, "newfile.txt"), "utf-8");
    // Should NOT have double newline - the trailing \n in content should be preserved as-is
    expect(fileContent).toBe("Hello, world!\n");
    expect(fileContent).not.toBe("Hello, world!\n\n");
  });

  it("should handle multiline content with trailing newline", async () => {
    // Setup
    const initialContent = "line1\nline2";
    await fs.writeFile(testFilePath, initialContent);

    using testEnv = createTestFileEditInsertTool({ cwd: testDir });
    const tool = testEnv.tool;
    const args: FileEditInsertToolArgs = {
      file_path: "test.txt",
      line_offset: 1,
      content: "INSERTED1\nINSERTED2\n", // Multiline with trailing newline
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(true);

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    // Should respect the trailing newline in content
    expect(updatedContent).toBe("line1\nINSERTED1\nINSERTED2\nline2");
  });
});
