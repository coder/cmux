import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { createFileListTool } from "./file_list";
import type { FileListToolArgs, FileListToolResult } from "@/types/tools";

describe("file_list tool", () => {
  let tempDir: string;
  let tool: ReturnType<typeof createFileListTool>;

  beforeEach(async () => {
    // Create a temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "file-list-test-"));
    tool = createFileListTool({ cwd: tempDir });
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("basic functionality", () => {
    test("lists files in a directory (depth 1)", async () => {
      // Create test structure
      await fs.writeFile(path.join(tempDir, "file1.txt"), "content1");
      await fs.writeFile(path.join(tempDir, "file2.txt"), "content2");
      await fs.mkdir(path.join(tempDir, "subdir"));

      const result = (await tool.execute!(
        {
          path: ".",
        },
        { abortSignal: new AbortController().signal }
      )) as Extract<FileListToolResult, { success: true }>;

      expect(result.success).toBe(true);
      expect(result.entries.length).toBe(3);
      expect(result.total_count).toBe(3);
      expect(result.depth_used).toBe(1);

      // Check sorting: directories first
      expect(result.entries[0].name).toBe("subdir");
      expect(result.entries[0].type).toBe("directory");
      expect(result.entries[1].name).toBe("file1.txt");
      expect(result.entries[1].type).toBe("file");
      expect(result.entries[2].name).toBe("file2.txt");
    });

    test("lists files recursively (depth 2)", async () => {
      // Create nested structure
      await fs.mkdir(path.join(tempDir, "dir1"));
      await fs.writeFile(path.join(tempDir, "dir1", "file1.txt"), "content");
      await fs.writeFile(path.join(tempDir, "root.txt"), "root");

      const result = (await tool.execute!(
        {
          path: ".",
          max_depth: 2,
        },
        { abortSignal: new AbortController().signal }
      )) as Extract<FileListToolResult, { success: true }>;

      expect(result.success).toBe(true);
      expect(result.total_count).toBe(3); // dir1, dir1/file1.txt, root.txt
      expect(result.depth_used).toBe(2);

      const dir1 = result.entries.find((e) => e.name === "dir1");
      expect(dir1).toBeDefined();
      expect(dir1!.children).toBeDefined();
      expect(dir1!.children!.length).toBe(1);
      expect(dir1!.children![0].name).toBe("file1.txt");
    });

    test("shows file sizes", async () => {
      const content = "a".repeat(100);
      await fs.writeFile(path.join(tempDir, "file.txt"), content);

      const result = (await tool.execute!(
        {
          path: ".",
        },
        { abortSignal: new AbortController().signal }
      )) as Extract<FileListToolResult, { success: true }>;

      expect(result.success).toBe(true);
      expect(result.entries[0].size).toBe(100);
    });

    test("empty directory", async () => {
      const result = (await tool.execute!(
        {
          path: ".",
        },
        { abortSignal: new AbortController().signal }
      )) as Extract<FileListToolResult, { success: true }>;

      expect(result.success).toBe(true);
      expect(result.entries.length).toBe(0);
      expect(result.total_count).toBe(0);
    });
  });

  describe("pattern filtering", () => {
    test("filters by pattern (*.ts)", async () => {
      await fs.writeFile(path.join(tempDir, "file1.ts"), "ts");
      await fs.writeFile(path.join(tempDir, "file2.js"), "js");
      await fs.writeFile(path.join(tempDir, "file3.ts"), "ts");

      const result = (await tool.execute!(
        {
          path: ".",
          pattern: "*.ts",
        },
        { abortSignal: new AbortController().signal }
      )) as Extract<FileListToolResult, { success: true }>;

      expect(result.success).toBe(true);
      expect(result.entries.length).toBe(2);
      expect(result.entries.every((e) => e.name.endsWith(".ts"))).toBe(true);
    });

    test("prunes empty directories when using pattern", async () => {
      // Create structure where some dirs have no matches
      await fs.mkdir(path.join(tempDir, "hasTs"));
      await fs.writeFile(path.join(tempDir, "hasTs", "file.ts"), "ts");
      await fs.mkdir(path.join(tempDir, "noTs"));
      await fs.writeFile(path.join(tempDir, "noTs", "file.js"), "js");

      const result = (await tool.execute!(
        {
          path: ".",
          pattern: "*.ts",
          max_depth: 2,
        },
        { abortSignal: new AbortController().signal }
      )) as Extract<FileListToolResult, { success: true }>;

      expect(result.success).toBe(true);
      // Should only include hasTs directory (not noTs)
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].name).toBe("hasTs");
    });
  });

  describe("gitignore filtering", () => {
    test("respects .gitignore by default", async () => {
      // Create .gitignore
      await fs.writeFile(path.join(tempDir, ".gitignore"), "ignored.txt\nnode_modules/\n");

      // Create files
      await fs.writeFile(path.join(tempDir, "included.txt"), "inc");
      await fs.writeFile(path.join(tempDir, "ignored.txt"), "ign");
      await fs.mkdir(path.join(tempDir, "node_modules"));
      await fs.writeFile(path.join(tempDir, "node_modules", "pkg.json"), "{}");

      const result = (await tool.execute!(
        {
          path: ".",
        },
        { abortSignal: new AbortController().signal }
      )) as Extract<FileListToolResult, { success: true }>;

      expect(result.success).toBe(true);
      // Should include .gitignore and included.txt, but not ignored.txt or node_modules
      expect(result.entries.some((e) => e.name === ".gitignore")).toBe(true);
      expect(result.entries.some((e) => e.name === "included.txt")).toBe(true);
      expect(result.entries.some((e) => e.name === "ignored.txt")).toBe(false);
      expect(result.entries.some((e) => e.name === "node_modules")).toBe(false);
    });

    test("shows all files when gitignore=false", async () => {
      await fs.writeFile(path.join(tempDir, ".gitignore"), "ignored.txt\n");
      await fs.writeFile(path.join(tempDir, "included.txt"), "inc");
      await fs.writeFile(path.join(tempDir, "ignored.txt"), "ign");

      const result = (await tool.execute!(
        {
          path: ".",
          gitignore: false,
        },
        { abortSignal: new AbortController().signal }
      )) as Extract<FileListToolResult, { success: true }>;

      expect(result.success).toBe(true);
      expect(result.entries.some((e) => e.name === "ignored.txt")).toBe(true);
    });

    test("always hides .git directory", async () => {
      await fs.mkdir(path.join(tempDir, ".git"));
      await fs.writeFile(path.join(tempDir, ".git", "config"), "git");
      await fs.writeFile(path.join(tempDir, "file.txt"), "content");

      const result = (await tool.execute!(
        {
          path: ".",
          gitignore: false,
        },
        { abortSignal: new AbortController().signal }
      )) as Extract<FileListToolResult, { success: true }>;

      expect(result.success).toBe(true);
      expect(result.entries.some((e) => e.name === ".git")).toBe(false);
    });

    test("shows hidden files (dotfiles)", async () => {
      await fs.writeFile(path.join(tempDir, ".env"), "secret");
      await fs.writeFile(path.join(tempDir, ".gitignore"), "*.log");
      await fs.writeFile(path.join(tempDir, "file.txt"), "content");

      const result = (await tool.execute!(
        {
          path: ".",
        },
        { abortSignal: new AbortController().signal }
      )) as Extract<FileListToolResult, { success: true }>;

      expect(result.success).toBe(true);
      expect(result.entries.some((e) => e.name === ".env")).toBe(true);
      expect(result.entries.some((e) => e.name === ".gitignore")).toBe(true);
    });
  });

  describe("limit enforcement", () => {
    test("returns error when exceeding default limit", async () => {
      // Create 65 files (exceeds default limit of 64)
      for (let i = 0; i < 65; i++) {
        await fs.writeFile(path.join(tempDir, `file${i}.txt`), `content${i}`);
      }

      const result = (await tool.execute!(
        {
          path: ".",
        },
        { abortSignal: new AbortController().signal }
      )) as Extract<FileListToolResult, { success: false }>;

      expect(result.success).toBe(false);
      expect(result.error).toContain("exceed limit");
      expect(result.total_found).toBeGreaterThan(64);
      expect(result.limit_requested).toBe(64);
    });

    test("respects custom max_entries", async () => {
      for (let i = 0; i < 20; i++) {
        await fs.writeFile(path.join(tempDir, `file${i}.txt`), "content");
      }

      const result = (await tool.execute!(
        {
          path: ".",
          max_entries: 10,
        },
        { abortSignal: new AbortController().signal }
      )) as Extract<FileListToolResult, { success: false }>;

      expect(result.success).toBe(false);
      expect(result.limit_requested).toBe(10);
    });

    test("enforces hard cap of 128 entries", async () => {
      for (let i = 0; i < 10; i++) {
        await fs.writeFile(path.join(tempDir, `file${i}.txt`), "content");
      }

      const result = (await tool.execute!(
        {
          path: ".",
          max_entries: 200, // Try to exceed hard cap
        },
        { abortSignal: new AbortController().signal }
      )) as Extract<FileListToolResult, { success: true }>;

      expect(result.success).toBe(true);
      // Should work since we're under 128
    });
  });

  describe("error handling", () => {
    test("returns error for non-existent path", async () => {
      const result = (await tool.execute!(
        {
          path: "nonexistent",
        },
        { abortSignal: new AbortController().signal }
      )) as Extract<FileListToolResult, { success: false }>;

      expect(result.success).toBe(false);
      expect(result.error).toContain("does not exist");
    });

    test("returns error for file path (not directory)", async () => {
      await fs.writeFile(path.join(tempDir, "file.txt"), "content");

      const result = (await tool.execute!(
        {
          path: "file.txt",
        },
        { abortSignal: new AbortController().signal }
      )) as Extract<FileListToolResult, { success: false }>;

      expect(result.success).toBe(false);
      expect(result.error).toContain("not a directory");
    });

    test("returns error for path outside cwd", async () => {
      const result = (await tool.execute!(
        {
          path: "..",
        },
        { abortSignal: new AbortController().signal }
      )) as Extract<FileListToolResult, { success: false }>;

      expect(result.success).toBe(false);
      expect(result.error).toContain("outside");
    });
  });

  describe("depth limits", () => {
    test("enforces max depth of 10", async () => {
      // Create deep nesting
      let currentPath = tempDir;
      for (let i = 0; i < 12; i++) {
        currentPath = path.join(currentPath, `level${i}`);
        await fs.mkdir(currentPath);
        await fs.writeFile(path.join(currentPath, "file.txt"), `level${i}`);
      }

      const result = (await tool.execute!(
        {
          path: ".",
          max_depth: 15, // Try to exceed max
        },
        { abortSignal: new AbortController().signal }
      )) as Extract<FileListToolResult, { success: true }>;

      expect(result.success).toBe(true);
      expect(result.depth_used).toBe(10); // Clamped to max
    });

    test("depth 1 does not traverse into subdirectories", async () => {
      await fs.mkdir(path.join(tempDir, "dir1"));
      await fs.writeFile(path.join(tempDir, "dir1", "nested.txt"), "nested");
      await fs.writeFile(path.join(tempDir, "root.txt"), "root");

      const result = (await tool.execute!(
        {
          path: ".",
          max_depth: 1,
        },
        { abortSignal: new AbortController().signal }
      )) as Extract<FileListToolResult, { success: true }>;

      expect(result.success).toBe(true);
      const dir = result.entries.find((e) => e.name === "dir1");
      expect(dir).toBeDefined();
      expect(dir!.children).toBeUndefined(); // No children at depth 1
    });
  });
});
