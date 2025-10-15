import { tool } from "ai";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";
import type { TodoItem } from "@/types/tools";
import { MAX_TODOS } from "@/constants/toolLimits";

/**
 * Get path to todos.json file in the stream's temporary directory
 */
function getTodoFilePath(tempDir: string): string {
  return path.join(tempDir, "todos.json");
}

/**
 * Read todos from filesystem
 */
async function readTodos(tempDir: string): Promise<TodoItem[]> {
  const todoFile = getTodoFilePath(tempDir);
  try {
    const content = await fs.readFile(todoFile, "utf-8");
    return JSON.parse(content) as TodoItem[];
  } catch {
    // File doesn't exist yet or is invalid
    return [];
  }
}

/**
 * Validate todo sequencing rules before persisting.
 * Enforces order: completed → in_progress → pending (top to bottom)
 * Enforces maximum count to encourage summarization.
 */
function validateTodos(todos: TodoItem[]): void {
  if (!Array.isArray(todos)) {
    throw new Error("Invalid todos payload: expected an array");
  }

  if (todos.length === 0) {
    return;
  }

  // Enforce maximum TODO count
  if (todos.length > MAX_TODOS) {
    throw new Error(
      `Too many TODOs (${todos.length}/${MAX_TODOS}). ` +
        `Keep high precision at the center: ` +
        `summarize old completed work (e.g., 'Setup phase (3 tasks)'), ` +
        `keep recent completions detailed (1-2), ` +
        `one in_progress, ` +
        `immediate pending detailed (2-3), ` +
        `and summarize far future work (e.g., 'Testing phase (4 items)').`
    );
  }

  let phase: "completed" | "in_progress" | "pending" = "completed";
  let inProgressCount = 0;

  todos.forEach((todo, index) => {
    const status = todo.status;

    switch (status) {
      case "completed": {
        if (phase !== "completed") {
          throw new Error(
            `Invalid todo order at index ${index}: completed tasks must appear before in-progress or pending tasks`
          );
        }
        // Stay in completed phase
        break;
      }
      case "in_progress": {
        if (phase === "pending") {
          throw new Error(
            `Invalid todo order at index ${index}: in-progress tasks must appear before pending tasks`
          );
        }
        inProgressCount += 1;
        if (inProgressCount > 1) {
          throw new Error(
            "Invalid todo list: only one task can be marked as in_progress at a time"
          );
        }
        // Transition to in_progress phase (from completed or stay in in_progress)
        phase = "in_progress";
        break;
      }
      case "pending": {
        // Transition to pending phase (from completed, in_progress, or stay in pending)
        phase = "pending";
        break;
      }
      default: {
        throw new Error(`Invalid todo status at index ${index}: ${String(status)}`);
      }
    }
  });
}

/**
 * Write todos to filesystem
 */
async function writeTodos(tempDir: string, todos: TodoItem[]): Promise<void> {
  validateTodos(todos);
  const todoFile = getTodoFilePath(tempDir);
  await fs.writeFile(todoFile, JSON.stringify(todos, null, 2), "utf-8");
}

/**
 * Todo write tool factory
 * Creates a tool that allows the AI to create/update the todo list
 */
export const createTodoWriteTool: ToolFactory = (config) => {
  return tool({
    description: TOOL_DEFINITIONS.todo_write.description,
    inputSchema: TOOL_DEFINITIONS.todo_write.schema,
    execute: async ({ todos }) => {
      await writeTodos(config.tempDir, todos);
      return {
        success: true as const,
        count: todos.length,
      };
    },
  });
};

/**
 * Todo read tool factory
 * Creates a tool that allows the AI to read the current todo list
 */
export const createTodoReadTool: ToolFactory = (config) => {
  return tool({
    description: TOOL_DEFINITIONS.todo_read.description,
    inputSchema: TOOL_DEFINITIONS.todo_read.schema,
    execute: async () => {
      const todos = await readTodos(config.tempDir);
      return {
        todos,
      };
    },
  });
};

/**
 * Set todos for a temp directory (useful for testing)
 */
export async function setTodosForTempDir(tempDir: string, todos: TodoItem[]): Promise<void> {
  await writeTodos(tempDir, todos);
}

/**
 * Get todos for a temp directory (useful for testing)
 */
export async function getTodosForTempDir(tempDir: string): Promise<TodoItem[]> {
  return readTodos(tempDir);
}

/**
 * Clear todos for a temp directory (useful for testing and cleanup)
 */
export async function clearTodosForTempDir(tempDir: string): Promise<void> {
  const todoFile = getTodoFilePath(tempDir);
  try {
    await fs.unlink(todoFile);
  } catch {
    // File doesn't exist, nothing to clear
  }
}
