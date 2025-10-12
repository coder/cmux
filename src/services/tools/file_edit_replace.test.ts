import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { createFileEditReplaceTool } from "./file_edit_replace";
import type {
  FileEditReplaceLinesPayload,
  FileEditReplaceStringPayload,
  FileEditReplaceToolArgs,
  FileEditReplaceToolResult,
} from "@/types/tools";
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
  tool: ReturnType<typeof createFileEditReplaceTool>,
  args: FileEditReplaceToolArgs
): Promise<FileEditReplaceToolResult> => {
  return (await tool.execute!(args, mockToolCallOptions)) as FileEditReplaceToolResult;
};

describe("file_edit_replace tool (string mode)", () => {
  let testDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "fileEditReplace-test-"));
    testFilePath = path.join(testDir, "test.txt");
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should apply a single edit successfully", async () => {
    await setupFile(testFilePath, "Hello world\nThis is a test\nGoodbye world");
    const tool = createFileEditReplaceTool({ cwd: testDir });

    const payload: FileEditReplaceStringPayload = {
      mode: "string",
      file_path: testFilePath,
      old_string: "Hello world",
      new_string: "Hello universe",
    };

    const result = await executeReplace(tool, payload);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.edits_applied).toBe(1);
    }

    expect(await readFile(testFilePath)).toBe("Hello universe\nThis is a test\nGoodbye world");
  });
});

describe("file_edit_replace tool (lines mode)", () => {
  let testDir: string;
  let testFilePath: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), "fileEditReplace-test-"));
    testFilePath = path.join(testDir, "test.txt");
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should replace a line range successfully", async () => {
    await setupFile(testFilePath, "line1\nline2\nline3\nline4");
    const tool = createFileEditReplaceTool({ cwd: testDir });

    const payload: FileEditReplaceLinesPayload = {
      mode: "lines",
      file_path: testFilePath,
      start_line: 2,
      end_line: 3,
      new_lines: ["LINE2", "LINE3"],
    };

    const result = await executeReplace(tool, payload);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.lines_replaced).toBe(2);
      expect(result.line_delta).toBe(0);
    }

    expect(await readFile(testFilePath)).toBe("line1\nLINE2\nLINE3\nline4");
  });
});
