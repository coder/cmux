import { tool } from "ai";
import * as fs from "fs/promises";
import * as path from "path";
import type { ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";
import type { TodoItem } from "@/types/tools";

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
 * Write todos to filesystem
 */
async function writeTodos(tempDir: string, todos: TodoItem[]): Promise<void> {
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
