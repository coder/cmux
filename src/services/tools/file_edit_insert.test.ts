import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { createFileEditInsertTool } from "./file_edit_insert";
import type { FileEditInsertToolArgs, FileEditInsertToolResult } from "@/types/tools";
import type { ToolCallOptions } from "ai";

// Mock ToolCallOptions for testing
const mockToolCallOptions: ToolCallOptions = {
  toolCallId: "test-call-id",
  messages: [],
};

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


    const tool = createFileEditInsertTool({ cwd: testDir });
    const args: FileEditInsertToolArgs = {
      file_path: testFilePath,
      line_offset: 0,
      content: "INSERTED",
      
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
    }

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("INSERTED\nline1\nline2\nline3");
  });

  it("should insert content after line 1 (line_offset = 1)", async () => {
    // Setup
    const initialContent = "line1\nline2\nline3";
    await fs.writeFile(testFilePath, initialContent);


    const tool = createFileEditInsertTool({ cwd: testDir });
    const args: FileEditInsertToolArgs = {
      file_path: testFilePath,
      line_offset: 1,
      content: "INSERTED",
      
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
    }

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("line1\nINSERTED\nline2\nline3");
  });

  it("should insert content after line 2 (line_offset = 2)", async () => {
    // Setup
    const initialContent = "line1\nline2\nline3";
    await fs.writeFile(testFilePath, initialContent);


    const tool = createFileEditInsertTool({ cwd: testDir });
    const args: FileEditInsertToolArgs = {
      file_path: testFilePath,
      line_offset: 2,
      content: "INSERTED",
      
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
    }

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("line1\nline2\nINSERTED\nline3");
  });

  it("should insert content at the end of the file (line_offset = line count)", async () => {
    // Setup
    const initialContent = "line1\nline2\nline3";
    await fs.writeFile(testFilePath, initialContent);


    const tool = createFileEditInsertTool({ cwd: testDir });
    const args: FileEditInsertToolArgs = {
      file_path: testFilePath,
      line_offset: 3,
      content: "INSERTED",
      
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
    }

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("line1\nline2\nline3\nINSERTED");
  });

  it("should insert multiline content", async () => {
    // Setup
    const initialContent = "line1\nline2";
    await fs.writeFile(testFilePath, initialContent);


    const tool = createFileEditInsertTool({ cwd: testDir });
    const args: FileEditInsertToolArgs = {
      file_path: testFilePath,
      line_offset: 1,
      content: "INSERTED1\nINSERTED2",
      
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
    }

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("line1\nINSERTED1\nINSERTED2\nline2");
  });

  it("should insert content into empty file", async () => {
    // Setup
    await fs.writeFile(testFilePath, "");


    const tool = createFileEditInsertTool({ cwd: testDir });
    const args: FileEditInsertToolArgs = {
      file_path: testFilePath,
      line_offset: 0,
      content: "INSERTED",
      
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
    }

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("INSERTED\n");
  });

  it("should fail when file does not exist", async () => {
    // Setup
    const nonExistentPath = path.join(testDir, "nonexistent.txt");

    const tool = createFileEditInsertTool({ cwd: testDir });
    const args: FileEditInsertToolArgs = {
      file_path: nonExistentPath,
      line_offset: 0,
      content: "INSERTED",
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditInsertToolResult;

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("File not found");
    }
  });

  it("should fail when line_offset is negative", async () => {
    // Setup
    const initialContent = "line1\nline2";
    await fs.writeFile(testFilePath, initialContent);


    const tool = createFileEditInsertTool({ cwd: testDir });
    const args: FileEditInsertToolArgs = {
      file_path: testFilePath,
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


    const tool = createFileEditInsertTool({ cwd: testDir });
    const args: FileEditInsertToolArgs = {
      file_path: testFilePath,
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
});
