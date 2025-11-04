import { describe, test, expect } from "bun:test";
import * as fs from "fs/promises";
import type { ToolCallOptions } from "ai";
import { createFileSearchTool } from "./file_search";
import type { FileSearchToolArgs, FileSearchToolResult } from "@/types/tools";
import { TestTempDir, createTestToolConfig } from "./testHelpers";
import { writeFileString } from "@/utils/runtime/helpers";

// Mock ToolCallOptions for testing
const mockToolCallOptions: ToolCallOptions = {
  toolCallId: "test-call-id",
  messages: [],
};

describe("file_search tool", () => {
  function createTestTool() {
    const tempDir = new TestTempDir("test-file-search");
    const config = createTestToolConfig(tempDir.path);
    const tool = createFileSearchTool(config);
    return {
      tool,
      tempDir,
      workspacePath: tempDir.path,
      runtime: config.runtime,
      [Symbol.dispose]() {
        tempDir[Symbol.dispose]();
      },
    };
  }

  test("finds single match in file", async () => {
    using testEnv = createTestTool();

    const testFilePath = `${testEnv.workspacePath}/test-search.txt`;
    await writeFileString(
      testEnv.runtime,
      testFilePath,
      "line 1\nline 2\ntarget line\nline 4\nline 5"
    );

    const args: FileSearchToolArgs = {
      file_path: "test-search.txt",
      pattern: "target",
      context_lines: 1,
    };

    const result = (await testEnv.tool.execute!(args, mockToolCallOptions)) as FileSearchToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].line_number).toBe(3);
      expect(result.matches[0].line_content).toBe("target line");
      expect(result.matches[0].context_before).toEqual(["line 2"]);
      expect(result.matches[0].context_after).toEqual(["line 4"]);
      expect(result.total_matches).toBe(1);
    }
  });

  test("finds multiple matches in file", async () => {
    using testEnv = createTestTool();

    const testFilePath = `${testEnv.workspacePath}/multi-match.txt`;
    await writeFileString(testEnv.runtime, testFilePath, "foo bar\nbaz foo\nqux\nfoo baz\nend");

    const args: FileSearchToolArgs = {
      file_path: "multi-match.txt",
      pattern: "foo",
    };

    const result = (await testEnv.tool.execute!(args, mockToolCallOptions)) as FileSearchToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.matches).toHaveLength(3);
      expect(result.matches[0].line_number).toBe(1);
      expect(result.matches[1].line_number).toBe(2);
      expect(result.matches[2].line_number).toBe(4);
      expect(result.total_matches).toBe(3);
    }
  });

  test("returns empty matches when pattern not found", async () => {
    using testEnv = createTestTool();

    const testFilePath = `${testEnv.workspacePath}/no-match.txt`;
    await writeFileString(testEnv.runtime, testFilePath, "line 1\nline 2\nline 3");

    const args: FileSearchToolArgs = {
      file_path: "no-match.txt",
      pattern: "nonexistent",
    };

    const result = (await testEnv.tool.execute!(args, mockToolCallOptions)) as FileSearchToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.matches).toHaveLength(0);
      expect(result.total_matches).toBe(0);
    }
  });

  test("respects max_results limit", async () => {
    using testEnv = createTestTool();

    const testFilePath = `${testEnv.workspacePath}/many-matches.txt`;
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i} with target`).join("\n");
    await writeFileString(testEnv.runtime, testFilePath, lines);

    const args: FileSearchToolArgs = {
      file_path: "many-matches.txt",
      pattern: "target",
      max_results: 10,
    };

    const result = (await testEnv.tool.execute!(args, mockToolCallOptions)) as FileSearchToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.matches).toHaveLength(10);
      expect(result.total_matches).toBe(10);
    }
  });

  test("handles context_lines at file boundaries", async () => {
    using testEnv = createTestTool();

    const testFilePath = `${testEnv.workspacePath}/boundary.txt`;
    await writeFileString(testEnv.runtime, testFilePath, "target at start\nline 2\nline 3");

    const args: FileSearchToolArgs = {
      file_path: "boundary.txt",
      pattern: "target",
      context_lines: 5,
    };

    const result = (await testEnv.tool.execute!(args, mockToolCallOptions)) as FileSearchToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.matches[0].context_before).toHaveLength(0);
      expect(result.matches[0].context_after).toHaveLength(2);
    }
  });

  test("handles zero context_lines", async () => {
    using testEnv = createTestTool();

    const testFilePath = `${testEnv.workspacePath}/no-context.txt`;
    await writeFileString(testEnv.runtime, testFilePath, "line 1\ntarget\nline 3");

    const args: FileSearchToolArgs = {
      file_path: "no-context.txt",
      pattern: "target",
      context_lines: 0,
    };

    const result = (await testEnv.tool.execute!(args, mockToolCallOptions)) as FileSearchToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.matches[0].context_before).toHaveLength(0);
      expect(result.matches[0].context_after).toHaveLength(0);
    }
  });

  test("fails when file does not exist", async () => {
    using testEnv = createTestTool();

    const args: FileSearchToolArgs = {
      file_path: "nonexistent.txt",
      pattern: "anything",
    };

    const result = (await testEnv.tool.execute!(args, mockToolCallOptions)) as FileSearchToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("ENOENT");
    }
  });

  test("fails when path is directory", async () => {
    using testEnv = createTestTool();

    const dirPath = `${testEnv.workspacePath}/testdir`;
    await fs.mkdir(dirPath);

    const args: FileSearchToolArgs = {
      file_path: "testdir",
      pattern: "anything",
    };

    const result = (await testEnv.tool.execute!(args, mockToolCallOptions)) as FileSearchToolResult;

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("directory");
    }
  });

  test("case-sensitive search", async () => {
    using testEnv = createTestTool();

    const testFilePath = `${testEnv.workspacePath}/case-test.txt`;
    await writeFileString(testEnv.runtime, testFilePath, "Target\ntarget\nTARGET");

    const args: FileSearchToolArgs = {
      file_path: "case-test.txt",
      pattern: "target",
    };

    const result = (await testEnv.tool.execute!(args, mockToolCallOptions)) as FileSearchToolResult;

    if (!result.success) {
      console.log("Case test error:", result.error);
    }
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.matches).toHaveLength(1);
      expect(result.matches[0].line_number).toBe(2);
    }
  });

  test("searches for exact substring", async () => {
    using testEnv = createTestTool();

    const testFilePath = `${testEnv.workspacePath}/substring.txt`;
    await writeFileString(
      testEnv.runtime,
      testFilePath,
      "function foo() {\n  return bar;\n}\nfoo()"
    );

    const args: FileSearchToolArgs = {
      file_path: "substring.txt",
      pattern: "foo",
    };

    const result = (await testEnv.tool.execute!(args, mockToolCallOptions)) as FileSearchToolResult;

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.matches).toHaveLength(2);
    }
  });
});
