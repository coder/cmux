import { describe, it, expect, beforeEach } from "@jest/globals";
import { clearTodosForWorkspace, getTodosForWorkspace, setTodosForWorkspace } from "./todo";
import type { TodoItem } from "@/types/tools";

describe("Todo Storage", () => {
  const workspaceId = "test-workspace";

  beforeEach(() => {
    // Clear todos before each test
    clearTodosForWorkspace(workspaceId);
  });

  describe("setTodosForWorkspace", () => {
    it("should store todo list for workspace", () => {
      const todos: TodoItem[] = [
        {
          content: "Install dependencies",
          status: "completed",
          activeForm: "Installing dependencies",
        },
        {
          content: "Write tests",
          status: "in_progress",
          activeForm: "Writing tests",
        },
        {
          content: "Update documentation",
          status: "pending",
          activeForm: "Updating documentation",
        },
      ];

      setTodosForWorkspace(workspaceId, todos);

      const storedTodos = getTodosForWorkspace(workspaceId);
      expect(storedTodos).toEqual(todos);
    });

    it("should replace entire todo list on update", () => {
      // Create initial list
      const initialTodos: TodoItem[] = [
        {
          content: "Task 1",
          status: "pending",
          activeForm: "Doing task 1",
        },
        {
          content: "Task 2",
          status: "pending",
          activeForm: "Doing task 2",
        },
      ];

      setTodosForWorkspace(workspaceId, initialTodos);

      // Replace with updated list
      const updatedTodos: TodoItem[] = [
        {
          content: "Task 1",
          status: "completed",
          activeForm: "Doing task 1",
        },
        {
          content: "Task 2",
          status: "in_progress",
          activeForm: "Doing task 2",
        },
        {
          content: "Task 3",
          status: "pending",
          activeForm: "Doing task 3",
        },
      ];

      setTodosForWorkspace(workspaceId, updatedTodos);

      // Verify list was replaced, not merged
      const storedTodos = getTodosForWorkspace(workspaceId);
      expect(storedTodos).toEqual(updatedTodos);
    });

    it("should handle empty todo list", () => {
      // Create initial list
      setTodosForWorkspace(workspaceId, [
        {
          content: "Task 1",
          status: "pending",
          activeForm: "Doing task 1",
        },
      ]);

      // Clear list
      setTodosForWorkspace(workspaceId, []);

      const storedTodos = getTodosForWorkspace(workspaceId);
      expect(storedTodos).toEqual([]);
    });
  });

  describe("getTodosForWorkspace", () => {
    it("should return empty array when no todos exist", () => {
      const todos = getTodosForWorkspace(workspaceId);
      expect(todos).toEqual([]);
    });

    it("should return current todo list", () => {
      const todos: TodoItem[] = [
        {
          content: "Task 1",
          status: "completed",
          activeForm: "Doing task 1",
        },
        {
          content: "Task 2",
          status: "in_progress",
          activeForm: "Doing task 2",
        },
      ];

      setTodosForWorkspace(workspaceId, todos);

      const retrievedTodos = getTodosForWorkspace(workspaceId);
      expect(retrievedTodos).toEqual(todos);
    });
  });

  describe("workspace isolation", () => {
    it("should isolate todos between workspaces", () => {
      const workspace1Id = "workspace-1";
      const workspace2Id = "workspace-2";

      // Create different todos in each workspace
      const todos1: TodoItem[] = [
        {
          content: "Workspace 1 task",
          status: "pending",
          activeForm: "Working on workspace 1",
        },
      ];

      const todos2: TodoItem[] = [
        {
          content: "Workspace 2 task",
          status: "pending",
          activeForm: "Working on workspace 2",
        },
      ];

      setTodosForWorkspace(workspace1Id, todos1);
      setTodosForWorkspace(workspace2Id, todos2);

      // Verify each workspace has its own todos
      const retrievedTodos1 = getTodosForWorkspace(workspace1Id);
      const retrievedTodos2 = getTodosForWorkspace(workspace2Id);

      expect(retrievedTodos1).toEqual(todos1);
      expect(retrievedTodos2).toEqual(todos2);

      // Clean up
      clearTodosForWorkspace(workspace1Id);
      clearTodosForWorkspace(workspace2Id);
    });
  });

  describe("clearTodosForWorkspace", () => {
    it("should clear todos for specific workspace", () => {
      const todos: TodoItem[] = [
        {
          content: "Task 1",
          status: "pending",
          activeForm: "Doing task 1",
        },
      ];

      setTodosForWorkspace(workspaceId, todos);
      expect(getTodosForWorkspace(workspaceId)).toEqual(todos);

      clearTodosForWorkspace(workspaceId);
      expect(getTodosForWorkspace(workspaceId)).toEqual([]);
    });
  });
});
