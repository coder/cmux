import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { createFileEditReplaceTool } from "./file_edit_replace";
import { leaseFromStat } from "./fileCommon";
import type { FileEditReplaceToolArgs, FileEditReplaceToolResult } from "../../types/tools";
import type { ToolCallOptions } from "ai";

// Mock ToolCallOptions for testing
const mockToolCallOptions: ToolCallOptions = {
  toolCallId: "test-call-id",
  messages: [],
};

// Test helpers
const setupFile = async (filePath: string, content: string): Promise<string> => {
  await fs.writeFile(filePath, content);
  const stats = await fs.stat(filePath);
  return leaseFromStat(stats);
};

const readFile = async (filePath: string): Promise<string> => {
  return await fs.readFile(filePath, "utf-8");
};

const executeReplace = async (
  tool: ReturnType<typeof createFileEditReplaceTool>,
  filePath: string,
  edits: FileEditReplaceToolArgs["edits"],
  lease: string
): Promise<FileEditReplaceToolResult> => {
  const args: FileEditReplaceToolArgs = { file_path: filePath, edits, lease };
  return (await tool.execute!(args, mockToolCallOptions)) as FileEditReplaceToolResult;
};

describe("file_edit_replace tool", () => {
  let testDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    // Create a temporary directory for test files
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "fileEditReplace-test-"));
    testFilePath = path.join(testDir, "test.txt");
  });

  afterEach(async () => {
    // Clean up test directory
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should apply a single edit successfully", async () => {
    const lease = await setupFile(testFilePath, "Hello world\nThis is a test\nGoodbye world");
    const tool = createFileEditReplaceTool({ cwd: testDir });

    const result = await executeReplace(
      tool,
      testFilePath,
      [{ old_string: "Hello world", new_string: "Hello universe" }],
      lease
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.edits_applied).toBe(1);
      expect(result.lease).toMatch(/^[0-9a-f]{6}$/);
      expect(result.lease).not.toBe(lease);
    }

    expect(await readFile(testFilePath)).toBe("Hello universe\nThis is a test\nGoodbye world");
  });

  it("should apply multiple edits sequentially", async () => {
    const lease = await setupFile(testFilePath, "foo bar baz");
    const tool = createFileEditReplaceTool({ cwd: testDir });

    const result = await executeReplace(
      tool,
      testFilePath,
      [
        { old_string: "foo", new_string: "FOO" },
        { old_string: "bar", new_string: "BAR" },
        { old_string: "baz", new_string: "BAZ" },
      ],
      lease
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.edits_applied).toBe(3);
      expect(result.lease).toMatch(/^[0-9a-f]{6}$/);
    }

    expect(await readFile(testFilePath)).toBe("FOO BAR BAZ");
  });

  it("should rollback if later edit fails (first edit breaks second edit search)", async () => {
    // Setup - This test demonstrates that multi-edit is a state machine:
    // each edit operates on the OUTPUT of the previous edit, not the original file.
    // If any edit fails, the entire operation is rolled back (file unchanged).
    const initialContent = "foo bar baz";
    await fs.writeFile(testFilePath, initialContent);

    const stats = await fs.stat(testFilePath);
    const lease = leaseFromStat(stats);

    const tool = createFileEditReplaceTool({ cwd: testDir });
    const args: FileEditReplaceToolArgs = {
      file_path: testFilePath,
      edits: [
        {
          old_string: "foo",
          new_string: "FOO",
        },
        {
          // This edit will FAIL because "foo" was already replaced by the first edit
          // The second edit operates on "FOO bar baz", not "foo bar baz"
          old_string: "foo",
          new_string: "qux",
        },
      ],
      lease,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditReplaceToolResult;

    // Assert - The operation should fail
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Edit 2");
      expect(result.error).toContain("old_string not found");
    }

    // Critical assertion: File should remain UNCHANGED because edit failed
    // The atomic write should not have occurred
    const finalContent = await fs.readFile(testFilePath, "utf-8");
    expect(finalContent).toBe(initialContent);
    expect(finalContent).toBe("foo bar baz"); // Still the original content
  });

  it("should replace all occurrences when replace_count is -1", async () => {
    // Setup
    const initialContent = "cat dog cat bird cat";
    await fs.writeFile(testFilePath, initialContent);

    const stats = await fs.stat(testFilePath);
    const lease = leaseFromStat(stats);

    const tool = createFileEditReplaceTool({ cwd: testDir });
    const args: FileEditReplaceToolArgs = {
      file_path: testFilePath,
      edits: [
        {
          old_string: "cat",
          new_string: "mouse",
          replace_count: -1,
        },
      ],
      lease,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditReplaceToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.edits_applied).toBe(3);
      expect(result.lease).toMatch(/^[0-9a-f]{6}$/);
    }

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("mouse dog mouse bird mouse");
  });

  it("should replace unique occurrence when replace_count defaults to 1", async () => {
    // Setup
    const initialContent = "cat dog bird";
    await fs.writeFile(testFilePath, initialContent);

    const stats = await fs.stat(testFilePath);
    const lease = leaseFromStat(stats);

    const tool = createFileEditReplaceTool({ cwd: testDir });
    const args: FileEditReplaceToolArgs = {
      file_path: testFilePath,
      edits: [
        {
          old_string: "cat",
          new_string: "mouse",
          // replace_count omitted, defaults to 1
        },
      ],
      lease,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditReplaceToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.edits_applied).toBe(1);
      expect(result.lease).toMatch(/^[0-9a-f]{6}$/);
    }

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("mouse dog bird");
  });

  it("should fail when old_string is not found", async () => {
    // Setup
    const initialContent = "Hello world";
    await fs.writeFile(testFilePath, initialContent);

    const stats = await fs.stat(testFilePath);
    const lease = leaseFromStat(stats);

    const tool = createFileEditReplaceTool({ cwd: testDir });
    const args: FileEditReplaceToolArgs = {
      file_path: testFilePath,
      edits: [
        {
          old_string: "nonexistent",
          new_string: "replacement",
        },
      ],
      lease,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditReplaceToolResult;

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("old_string not found");
    }

    // File should remain unchanged
    const content = await fs.readFile(testFilePath, "utf-8");
    expect(content).toBe(initialContent);
  });

  it("should fail when old_string appears multiple times with replace_count of 1", async () => {
    // Setup
    const initialContent = "cat dog cat bird cat";
    await fs.writeFile(testFilePath, initialContent);

    const stats = await fs.stat(testFilePath);
    const lease = leaseFromStat(stats);

    const tool = createFileEditReplaceTool({ cwd: testDir });
    const args: FileEditReplaceToolArgs = {
      file_path: testFilePath,
      edits: [
        {
          old_string: "cat",
          new_string: "mouse",
          replace_count: 1, // Explicitly set to 1
        },
      ],
      lease,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditReplaceToolResult;

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("appears 3 times");
      expect(result.error).toContain("expand the context to make it unique");
      expect(result.error).toContain("replace_count to 3 or -1");
    }

    // File should remain unchanged
    const content = await fs.readFile(testFilePath, "utf-8");
    expect(content).toBe(initialContent);
  });

  it("should replace exactly N occurrences when replace_count is N", async () => {
    // Setup
    const initialContent = "cat dog cat bird cat";
    await fs.writeFile(testFilePath, initialContent);

    const stats = await fs.stat(testFilePath);
    const lease = leaseFromStat(stats);

    const tool = createFileEditReplaceTool({ cwd: testDir });
    const args: FileEditReplaceToolArgs = {
      file_path: testFilePath,
      edits: [
        {
          old_string: "cat",
          new_string: "mouse",
          replace_count: 2, // Replace first 2 occurrences
        },
      ],
      lease,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditReplaceToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.edits_applied).toBe(2);
      expect(result.lease).toMatch(/^[0-9a-f]{6}$/);
    }

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("mouse dog mouse bird cat");
  });

  it("should fail when replace_count exceeds actual occurrences", async () => {
    // Setup
    const initialContent = "cat dog bird";
    await fs.writeFile(testFilePath, initialContent);

    const stats = await fs.stat(testFilePath);
    const lease = leaseFromStat(stats);

    const tool = createFileEditReplaceTool({ cwd: testDir });
    const args: FileEditReplaceToolArgs = {
      file_path: testFilePath,
      edits: [
        {
          old_string: "cat",
          new_string: "mouse",
          replace_count: 5, // Only 1 occurrence exists
        },
      ],
      lease,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditReplaceToolResult;

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("replace_count is 5");
      expect(result.error).toContain("only appears 1 time(s)");
    }

    // File should remain unchanged
    const content = await fs.readFile(testFilePath, "utf-8");
    expect(content).toBe(initialContent);
  });

  it("should fail when file does not exist", async () => {
    // Setup
    const nonExistentPath = path.join(testDir, "nonexistent.txt");

    const tool = createFileEditReplaceTool({ cwd: testDir });
    const args: FileEditReplaceToolArgs = {
      file_path: nonExistentPath,
      edits: [
        {
          old_string: "foo",
          new_string: "bar",
        },
      ],
      lease: "000000", // Doesn't matter, file doesn't exist
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditReplaceToolResult;

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("File not found");
    }
  });

  it("should handle multiline edits", async () => {
    // Setup
    const initialContent = "line1\nline2\nline3\nline4";
    await fs.writeFile(testFilePath, initialContent);

    const stats = await fs.stat(testFilePath);
    const lease = leaseFromStat(stats);

    const tool = createFileEditReplaceTool({ cwd: testDir });
    const args: FileEditReplaceToolArgs = {
      file_path: testFilePath,
      edits: [
        {
          old_string: "line2\nline3",
          new_string: "REPLACED",
        },
      ],
      lease,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditReplaceToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.edits_applied).toBe(1);
      expect(result.lease).toMatch(/^[0-9a-f]{6}$/);
    }

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("line1\nREPLACED\nline4");
  });

  it("should handle empty string replacement", async () => {
    // Setup
    const initialContent = "Hello [DELETE_ME] world";
    await fs.writeFile(testFilePath, initialContent);

    const stats = await fs.stat(testFilePath);
    const lease = leaseFromStat(stats);

    const tool = createFileEditReplaceTool({ cwd: testDir });
    const args: FileEditReplaceToolArgs = {
      file_path: testFilePath,
      edits: [
        {
          old_string: "[DELETE_ME] ",
          new_string: "",
        },
      ],
      lease,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditReplaceToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.edits_applied).toBe(1);
      expect(result.lease).toMatch(/^[0-9a-f]{6}$/);
    }

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("Hello world");
  });

  it("should handle edits that depend on previous edits", async () => {
    // Setup
    const initialContent = "step1";
    await fs.writeFile(testFilePath, initialContent);

    const stats = await fs.stat(testFilePath);
    const lease = leaseFromStat(stats);

    const tool = createFileEditReplaceTool({ cwd: testDir });
    const args: FileEditReplaceToolArgs = {
      file_path: testFilePath,
      edits: [
        {
          old_string: "step1",
          new_string: "step2",
        },
        {
          old_string: "step2",
          new_string: "step3",
        },
      ],
      lease,
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditReplaceToolResult;

    // Assert
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.edits_applied).toBe(2);
      expect(result.lease).toMatch(/^[0-9a-f]{6}$/);
    }

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("step3");
  });

  it("should reject edit with incorrect lease", async () => {
    // Setup
    const initialContent = "Hello world";
    await fs.writeFile(testFilePath, initialContent);

    const tool = createFileEditReplaceTool({ cwd: testDir });
    const args: FileEditReplaceToolArgs = {
      file_path: testFilePath,
      edits: [
        {
          old_string: "world",
          new_string: "universe",
        },
      ],
      lease: "ffffff", // Incorrect lease
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditReplaceToolResult;

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("lease mismatch");
      expect(result.error).toContain("read the file again");
    }

    // File should remain unchanged
    const content = await fs.readFile(testFilePath, "utf-8");
    expect(content).toBe(initialContent);
  });

  it("should detect file modified between read and edit", async () => {
    // Setup - create initial file
    const initialContent = "Hello world";
    await fs.writeFile(testFilePath, initialContent);

    // Get initial lease
    const stats = await fs.stat(testFilePath);
    const lease = leaseFromStat(stats);

    // Modify file to simulate concurrent edit
    await fs.writeFile(testFilePath, "Modified content");

    const tool = createFileEditReplaceTool({ cwd: testDir });
    const args: FileEditReplaceToolArgs = {
      file_path: testFilePath,
      edits: [
        {
          old_string: "world",
          new_string: "universe",
        },
      ],
      lease, // This lease is now stale
    };

    // Execute
    const result = (await tool.execute!(args, mockToolCallOptions)) as FileEditReplaceToolResult;

    // Assert
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("lease mismatch");
    }
  });
});
