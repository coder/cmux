import { describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { clearTodosForTempDir, getTodosForTempDir, setTodosForTempDir } from "./todo";
import type { TodoItem } from "@/types/tools";

describe("Todo Storage", () => {
  let runtimeTempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "todo-test-"));
  });

  afterEach(async () => {
    // Clean up temporary directory after each test
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("setTodosForTempDir", () => {
    it("should store todo list in temp directory", async () => {
      const todos: TodoItem[] = [
        {
          content: "Installed dependencies",
          status: "completed",
        },
        {
          content: "Writing tests",
          status: "in_progress",
        },
        {
          content: "Update documentation",
          status: "pending",
        },
      ];

      await setTodosForTempDir(tempDir, todos);

      const storedTodos = await getTodosForTempDir(tempDir);
      expect(storedTodos).toEqual(todos);
    });

    it("should replace entire todo list on update", async () => {
      // Create initial list
      const initialTodos: TodoItem[] = [
        {
          content: "Task 1",
          status: "pending",
        },
        {
          content: "Task 2",
          status: "pending",
        },
      ];

      await setTodosForTempDir(tempDir, initialTodos);

      // Replace with updated list
      const updatedTodos: TodoItem[] = [
        {
          content: "Task 1",
          status: "completed",
        },
        {
          content: "Task 2",
          status: "in_progress",
        },
        {
          content: "Task 3",
          status: "pending",
        },
      ];

      await setTodosForTempDir(tempDir, updatedTodos);

      // Verify list was replaced, not merged
      const storedTodos = await getTodosForTempDir(tempDir);
      expect(storedTodos).toEqual(updatedTodos);
    });

    it("should handle empty todo list", async () => {
      // Create initial list
      await setTodosForTempDir(tempDir, [
        {
          content: "Task 1",
          status: "pending",
        },
      ]);

      // Clear list
      await setTodosForTempDir(tempDir, []);

      const storedTodos = await getTodosForTempDir(tempDir);
      expect(storedTodos).toEqual([]);
    });

    it("should reject when exceeding MAX_TODOS limit", async () => {
      // Create a list with 8 items (exceeds MAX_TODOS = 7)
      const tooManyTodos: TodoItem[] = [
        { content: "Task 1", status: "completed" },
        { content: "Task 2", status: "completed" },
        { content: "Task 3", status: "completed" },
        { content: "Task 4", status: "completed" },
        { content: "Task 5", status: "in_progress" },
        { content: "Task 6", status: "pending" },
        { content: "Task 7", status: "pending" },
        { content: "Task 8", status: "pending" },
      ];

      await expect(setTodosForTempDir(tempDir, tooManyTodos)).rejects.toThrow(
        /Too many TODOs \(8\/7\)/i
      );
      await expect(setTodosForTempDir(tempDir, tooManyTodos)).rejects.toThrow(
        /Keep high precision at the center/i
      );
    });

    it("should accept exactly MAX_TODOS items", async () => {
      const maxTodos: TodoItem[] = [
        { content: "Old work (2 tasks)", status: "completed" },
        { content: "Recent task", status: "completed" },
        { content: "Current work", status: "in_progress" },
        { content: "Next step 1", status: "pending" },
        { content: "Next step 2", status: "pending" },
        { content: "Next step 3", status: "pending" },
        { content: "Future work (5 items)", status: "pending" },
      ];

      await setTodosForTempDir(tempDir, maxTodos);
      expect(await getTodosForTempDir(tempDir)).toEqual(maxTodos);
    });

    it("should reject multiple in_progress tasks", async () => {
      const validTodos: TodoItem[] = [
        {
          content: "Step 1",
          status: "pending",
        },
      ];

      await setTodosForTempDir(tempDir, validTodos);

      const invalidTodos: TodoItem[] = [
        {
          content: "Step 1",
          status: "in_progress",
        },
        {
          content: "Step 2",
          status: "in_progress",
        },
      ];

      await expect(setTodosForTempDir(tempDir, invalidTodos)).rejects.toThrow(
        /only one task can be marked as in_progress/i
      );

      // Original todos should remain unchanged on failure
      expect(await getTodosForTempDir(tempDir)).toEqual(validTodos);
    });

    it("should reject when in_progress tasks appear after pending", async () => {
      const invalidTodos: TodoItem[] = [
        {
          content: "Step 1",
          status: "pending",
        },
        {
          content: "Step 2",
          status: "in_progress",
        },
      ];

      await expect(setTodosForTempDir(tempDir, invalidTodos)).rejects.toThrow(
        /in-progress tasks must appear before pending tasks/i
      );
    });

    it("should reject when completed tasks appear after in_progress", async () => {
      const invalidTodos: TodoItem[] = [
        {
          content: "Step 1",
          status: "in_progress",
        },
        {
          content: "Step 2",
          status: "completed",
        },
      ];

      await expect(setTodosForTempDir(tempDir, invalidTodos)).rejects.toThrow(
        /completed tasks must appear before in-progress or pending tasks/i
      );
    });

    it("should allow all completed tasks without in_progress", async () => {
      const todos: TodoItem[] = [
        {
          content: "Step 1",
          status: "completed",
        },
        {
          content: "Step 2",
          status: "completed",
        },
      ];

      await setTodosForTempDir(tempDir, todos);
      expect(await getTodosForTempDir(tempDir)).toEqual(todos);
    });
  });

  describe("getTodosForTempDir", () => {
    it("should return empty array when no todos exist", async () => {
      const todos = await getTodosForTempDir(tempDir);
      expect(todos).toEqual([]);
    });

    it("should return current todo list", async () => {
      const todos: TodoItem[] = [
        {
          content: "Task 1",
          status: "completed",
        },
        {
          content: "Task 2",
          status: "in_progress",
        },
      ];

      await setTodosForTempDir(tempDir, todos);

      const retrievedTodos = await getTodosForTempDir(tempDir);
      expect(retrievedTodos).toEqual(todos);
    });
  });

  describe("stream isolation", () => {
    it("should isolate todos between different temp directories", async () => {
      const tempDir1 = await fs.mkdtemp(path.join(os.tmpdir(), "todo-test-1-"));
      const tempDir2 = await fs.mkdtemp(path.join(os.tmpdir(), "todo-test-2-"));

      try {
        // Create different todos in each temp directory
        const todos1: TodoItem[] = [
          {
            content: "Stream 1 task",
            status: "pending",
          },
        ];

        const todos2: TodoItem[] = [
          {
            content: "Stream 2 task",
            status: "pending",
          },
        ];

        await setTodosForTempDir(tempDir1, todos1);
        await setTodosForTempDir(tempDir2, todos2);

        // Verify each temp directory has its own todos
        const retrievedTodos1 = await getTodosForTempDir(tempDir1);
        const retrievedTodos2 = await getTodosForTempDir(tempDir2);

        expect(retrievedTodos1).toEqual(todos1);
        expect(retrievedTodos2).toEqual(todos2);
      } finally {
        // Clean up
        await fs.rm(tempDir1, { recursive: true, force: true });
        await fs.rm(tempDir2, { recursive: true, force: true });
      }
    });
  });

  describe("clearTodosForTempDir", () => {
    it("should clear todos for specific temp directory", async () => {
      const todos: TodoItem[] = [
        {
          content: "Task 1",
          status: "pending",
        },
      ];

      await setTodosForTempDir(tempDir, todos);
      expect(await getTodosForTempDir(tempDir)).toEqual(todos);

      await clearTodosForTempDir(tempDir);
      expect(await getTodosForTempDir(tempDir)).toEqual([]);
    });
  });
});
