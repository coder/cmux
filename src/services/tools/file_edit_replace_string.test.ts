import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { createFileEditReplaceStringTool } from "./file_edit_replace_string";
import type { FileEditReplaceStringToolArgs, FileEditReplaceStringToolResult } from "@/types/tools";
import type { ToolCallOptions } from "ai";

// Mock ToolCallOptions for testing
const mockToolCallOptions: ToolCallOptions = {
  toolCallId: "test-call-id",
  messages: [],
};

// Test helpers
const setupFile = async (filePath: string, content: string): Promise<void> => {
  await fs.writeFile(filePath, content);
};

const readFile = async (filePath: string): Promise<string> => {
  return await fs.readFile(filePath, "utf-8");
};

const executeReplace = async (
  tool: ReturnType<typeof createFileEditReplaceStringTool>,
  filePath: string,
  edits: FileEditReplaceStringToolArgs["edits"]
): Promise<FileEditReplaceStringToolResult> => {
  const args: FileEditReplaceStringToolArgs = { file_path: filePath, edits };
  return (await tool.execute!(args, mockToolCallOptions)) as FileEditReplaceStringToolResult;
};

describe("file_edit_replace_string tool", () => {
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
    await setupFile(testFilePath, "Hello world\nThis is a test\nGoodbye world");
    const tool = createFileEditReplaceStringTool({ cwd: testDir });

    const result = await executeReplace(tool, testFilePath, [
      { old_string: "Hello world", new_string: "Hello universe" },
    ]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.edits_applied).toBe(1);
    }

    expect(await readFile(testFilePath)).toBe("Hello universe\nThis is a test\nGoodbye world");
  });

  it("should apply multiple edits sequentially", async () => {
    await setupFile(testFilePath, "foo bar baz");
    const tool = createFileEditReplaceStringTool({ cwd: testDir });

    const result = await executeReplace(tool, testFilePath, [
      { old_string: "foo", new_string: "FOO" },
      { old_string: "bar", new_string: "BAR" },
      { old_string: "baz", new_string: "BAZ" },
    ]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.edits_applied).toBe(3);
    }

    expect(await readFile(testFilePath)).toBe("FOO BAR BAZ");
  });

  it("should rollback if later edit fails (first edit breaks second edit search)", async () => {
    const initialContent = "foo bar baz";
    await fs.writeFile(testFilePath, initialContent);

    const tool = createFileEditReplaceStringTool({ cwd: testDir });
    const args: FileEditReplaceStringToolArgs = {
      file_path: testFilePath,
      edits: [
        { old_string: "foo", new_string: "FOO" },
        { old_string: "foo", new_string: "qux" },
      ],
    };

    const result = await executeReplace(tool, testFilePath, args.edits);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Edit 2");
      expect(result.error).toContain("old_string not found");
    }

    const finalContent = await fs.readFile(testFilePath, "utf-8");
    expect(finalContent).toBe(initialContent);
  });

  it("should replace all occurrences when replace_count is -1", async () => {
    const initialContent = "cat dog cat bird cat";
    await fs.writeFile(testFilePath, initialContent);

    const tool = createFileEditReplaceStringTool({ cwd: testDir });
    const args: FileEditReplaceStringToolArgs = {
      file_path: testFilePath,
      edits: [{ old_string: "cat", new_string: "mouse", replace_count: -1 }],
    };

    const result = await executeReplace(tool, testFilePath, args.edits);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.edits_applied).toBe(3);
    }

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("mouse dog mouse bird mouse");
  });

  it("should replace unique occurrence when replace_count defaults to 1", async () => {
    const initialContent = "cat dog bird";
    await fs.writeFile(testFilePath, initialContent);

    const tool = createFileEditReplaceStringTool({ cwd: testDir });
    const args: FileEditReplaceStringToolArgs = {
      file_path: testFilePath,
      edits: [{ old_string: "cat", new_string: "mouse" }],
    };

    const result = await executeReplace(tool, testFilePath, args.edits);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.edits_applied).toBe(1);
    }

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("mouse dog bird");
  });

  it("should fail when old_string is not found", async () => {
    const initialContent = "Hello world";
    await fs.writeFile(testFilePath, initialContent);

    const tool = createFileEditReplaceStringTool({ cwd: testDir });
    const args: FileEditReplaceStringToolArgs = {
      file_path: testFilePath,
      edits: [{ old_string: "nonexistent", new_string: "replacement" }],
    };

    const result = await executeReplace(tool, testFilePath, args.edits);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("old_string not found");
    }

    const unchangedContent = await fs.readFile(testFilePath, "utf-8");
    expect(unchangedContent).toBe(initialContent);
  });

  it("should fail when old_string appears multiple times with replace_count of 1", async () => {
    const initialContent = "cat dog cat bird cat";
    await fs.writeFile(testFilePath, initialContent);

    const tool = createFileEditReplaceStringTool({ cwd: testDir });
    const args: FileEditReplaceStringToolArgs = {
      file_path: testFilePath,
      edits: [{ old_string: "cat", new_string: "mouse", replace_count: 1 }],
    };

    const result = await executeReplace(tool, testFilePath, args.edits);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("appears 3 times");
      expect(result.error).toContain("replace_count to 3 or -1");
    }

    const unchangedContent = await fs.readFile(testFilePath, "utf-8");
    expect(unchangedContent).toBe(initialContent);
  });

  it("should replace exactly N occurrences when replace_count is N", async () => {
    const initialContent = "cat dog cat bird cat";
    await fs.writeFile(testFilePath, initialContent);

    const tool = createFileEditReplaceStringTool({ cwd: testDir });
    const args: FileEditReplaceStringToolArgs = {
      file_path: testFilePath,
      edits: [{ old_string: "cat", new_string: "mouse", replace_count: 2 }],
    };

    const result = await executeReplace(tool, testFilePath, args.edits);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.edits_applied).toBe(2);
    }

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("mouse dog mouse bird cat");
  });

  it("should fail when replace_count exceeds actual occurrences", async () => {
    const initialContent = "cat dog bird";
    await fs.writeFile(testFilePath, initialContent);

    const tool = createFileEditReplaceStringTool({ cwd: testDir });
    const args: FileEditReplaceStringToolArgs = {
      file_path: testFilePath,
      edits: [{ old_string: "cat", new_string: "mouse", replace_count: 5 }],
    };

    const result = await executeReplace(tool, testFilePath, args.edits);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("replace_count is 5");
      expect(result.error).toContain("only appears 1 time(s)");
    }

    const unchangedContent = await fs.readFile(testFilePath, "utf-8");
    expect(unchangedContent).toBe(initialContent);
  });

  it("should fail when file does not exist", async () => {
    const nonExistentPath = path.join(testDir, "nonexistent.txt");

    const tool = createFileEditReplaceStringTool({ cwd: testDir });
    const args: FileEditReplaceStringToolArgs = {
      file_path: nonExistentPath,
      edits: [{ old_string: "foo", new_string: "bar" }],
    };

    const result = await executeReplace(tool, nonExistentPath, args.edits);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("File not found");
    }
  });

  it("should handle multiline edits", async () => {
    const initialContent = "line1\nline2\nline3\nline4";
    await fs.writeFile(testFilePath, initialContent);

    const tool = createFileEditReplaceStringTool({ cwd: testDir });
    const args: FileEditReplaceStringToolArgs = {
      file_path: testFilePath,
      edits: [{ old_string: "line2\nline3", new_string: "REPLACED" }],
    };

    const result = await executeReplace(tool, testFilePath, args.edits);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.edits_applied).toBe(1);
    }

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("line1\nREPLACED\nline4");
  });

  it("should handle empty string replacement", async () => {
    const initialContent = "Hello [DELETE_ME] world";
    await fs.writeFile(testFilePath, initialContent);

    const tool = createFileEditReplaceStringTool({ cwd: testDir });
    const args: FileEditReplaceStringToolArgs = {
      file_path: testFilePath,
      edits: [{ old_string: "[DELETE_ME] ", new_string: "" }],
    };

    const result = await executeReplace(tool, testFilePath, args.edits);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.edits_applied).toBe(1);
    }

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("Hello world");
  });

  it("should handle edits that depend on previous edits", async () => {
    const initialContent = "step1";
    await fs.writeFile(testFilePath, initialContent);

    const tool = createFileEditReplaceStringTool({ cwd: testDir });
    const args: FileEditReplaceStringToolArgs = {
      file_path: testFilePath,
      edits: [
        { old_string: "step1", new_string: "step2" },
        { old_string: "step2", new_string: "step3" },
      ],
    };

    const result = await executeReplace(tool, testFilePath, args.edits);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.edits_applied).toBe(2);
    }

    const updatedContent = await fs.readFile(testFilePath, "utf-8");
    expect(updatedContent).toBe("step3");
  });

  it("should return unified diff with context of 3", async () => {
    const initialContent = "line1\nline2\nline3\nline4\nline5\nline6\nline7\nline8\nline9";
    await fs.writeFile(testFilePath, initialContent);

    const tool = createFileEditReplaceStringTool({ cwd: testDir });
    const args: FileEditReplaceStringToolArgs = {
      file_path: testFilePath,
      edits: [{ old_string: "line5", new_string: "LINE5_MODIFIED" }],
    };

    const result = await executeReplace(tool, testFilePath, args.edits);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.diff).toBeDefined();
      expect(result.diff).toContain("--- " + testFilePath);
      expect(result.diff).toContain("+++ " + testFilePath);
      expect(result.diff).toContain("-line5");
      expect(result.diff).toContain("+LINE5_MODIFIED");
      expect(result.diff).toContain("line2");
      expect(result.diff).toContain("line3");
      expect(result.diff).toContain("line4");
      expect(result.diff).toContain("line6");
      expect(result.diff).toContain("line7");
      expect(result.diff).toContain("line8");
    }
  });
});
