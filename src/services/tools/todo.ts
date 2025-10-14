import { tool } from "ai";
import type { ToolFactory } from "@/utils/tools/tools";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";
import type { TodoItem } from "@/types/tools";

// In-memory storage: Map<workspaceId, TodoItem[]>
const todoStore = new Map<string, TodoItem[]>();

/**
 * Extract workspace ID from cwd path
 * Expected format: ~/.cmux/src/<project_name>/<workspace_id>
 */
function getWorkspaceIdFromCwd(cwd: string): string {
  const parts = cwd.split("/");
  const srcIndex = parts.findIndex((p) => p === "src");
  if (srcIndex === -1 || srcIndex + 2 >= parts.length) {
    throw new Error(`Invalid workspace path: ${cwd}`);
  }
  return parts[srcIndex + 2]; // workspace_id is after project_name
}

/**
 * Todo write tool factory
 * Creates a tool that allows the AI to create/update the todo list
 */
export const createTodoWriteTool: ToolFactory = (config) => {
  return tool({
    description: TOOL_DEFINITIONS.todo_write.description,
    inputSchema: TOOL_DEFINITIONS.todo_write.schema,
    execute: ({ todos }) => {
      const workspaceId = getWorkspaceIdFromCwd(config.cwd);
      todoStore.set(workspaceId, todos);
      return Promise.resolve({
        success: true as const,
        count: todos.length,
      });
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
    execute: () => {
      const workspaceId = getWorkspaceIdFromCwd(config.cwd);
      const todos = todoStore.get(workspaceId) ?? [];
      return Promise.resolve({
        todos,
      });
    },
  });
};

/**
 * Set todos for a workspace (useful for testing)
 */
export function setTodosForWorkspace(workspaceId: string, todos: TodoItem[]): void {
  todoStore.set(workspaceId, todos);
}

/**
 * Get todos for a workspace (useful for testing)
 */
export function getTodosForWorkspace(workspaceId: string): TodoItem[] {
  return todoStore.get(workspaceId) ?? [];
}

/**
 * Clear todos for a workspace (useful for testing and cleanup)
 */
export function clearTodosForWorkspace(workspaceId: string): void {
  todoStore.delete(workspaceId);
}

