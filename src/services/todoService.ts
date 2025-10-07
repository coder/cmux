import * as fs from "fs/promises";
import * as path from "path";
import type { Result } from "@/types/result";
import { Ok, Err } from "@/types/result";
import type { Todo } from "@/types/todo";
import { TodoSchema } from "@/types/todo";
import type { Config } from "@/config";
import { workspaceFileLocks } from "@/utils/concurrency/workspaceFileLocks";
import { z } from "zod";

/**
 * TodoService - Manages workspace TODO lists
 *
 * Responsibilities:
 * - Read/write TODO lists to disk (JSON format)
 * - Add, remove, and toggle todos
 * - Store todos in workspace-specific todo.json files
 */
export class TodoService {
  private readonly TODO_FILE = "todo.json";
  private readonly fileLocks = workspaceFileLocks;
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  private getTodoPath(workspaceId: string): string {
    return path.join(this.config.getSessionDir(workspaceId), this.TODO_FILE);
  }

  /**
   * Read todos from todo.json
   * Returns empty array if file doesn't exist
   */
  async getTodos(workspaceId: string): Promise<Result<Todo[]>> {
    return this.fileLocks.withLock(workspaceId, async () => {
      try {
        const todoPath = this.getTodoPath(workspaceId);
        const data = await fs.readFile(todoPath, "utf-8");
        const parsed = JSON.parse(data);

        // Validate with Zod schema
        const validated = z.array(TodoSchema).parse(parsed);
        return Ok(validated);
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
          return Ok([]); // No todos yet
        }
        const message = error instanceof Error ? error.message : String(error);
        return Err(`Failed to read todos: ${message}`);
      }
    });
  }

  /**
   * Write todos to todo.json
   */
  private async writeTodos(workspaceId: string, todos: Todo[]): Promise<Result<void>> {
    return this.fileLocks.withLock(workspaceId, async () => {
      try {
        const workspaceDir = this.config.getSessionDir(workspaceId);
        await fs.mkdir(workspaceDir, { recursive: true });
        const todoPath = this.getTodoPath(workspaceId);
        await fs.writeFile(todoPath, JSON.stringify(todos, null, 2));
        return Ok(undefined);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return Err(`Failed to write todos: ${message}`);
      }
    });
  }

  /**
   * Add a new todo
   */
  async addTodo(workspaceId: string, id: string, text: string): Promise<Result<Todo[]>> {
    const todosResult = await this.getTodos(workspaceId);
    if (!todosResult.success) {
      return Err(todosResult.error);
    }

    const todos = todosResult.data;
    const newTodo: Todo = { id, text, completed: false };
    todos.push(newTodo);

    const writeResult = await this.writeTodos(workspaceId, todos);
    if (!writeResult.success) {
      return Err(writeResult.error);
    }

    return Ok(todos);
  }

  /**
   * Remove a todo by ID
   */
  async removeTodo(workspaceId: string, todoId: string): Promise<Result<Todo[]>> {
    const todosResult = await this.getTodos(workspaceId);
    if (!todosResult.success) {
      return Err(todosResult.error);
    }

    const todos = todosResult.data.filter((todo) => todo.id !== todoId);

    const writeResult = await this.writeTodos(workspaceId, todos);
    if (!writeResult.success) {
      return Err(writeResult.error);
    }

    return Ok(todos);
  }

  /**
   * Toggle a todo's completed status
   */
  async toggleTodo(workspaceId: string, todoId: string): Promise<Result<Todo[]>> {
    const todosResult = await this.getTodos(workspaceId);
    if (!todosResult.success) {
      return Err(todosResult.error);
    }

    const todos = todosResult.data;
    const todo = todos.find((t) => t.id === todoId);
    if (!todo) {
      return Err(`Todo with ID ${todoId} not found`);
    }

    todo.completed = !todo.completed;

    const writeResult = await this.writeTodos(workspaceId, todos);
    if (!writeResult.success) {
      return Err(writeResult.error);
    }

    return Ok(todos);
  }
}
