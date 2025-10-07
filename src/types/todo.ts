import { z } from "zod";

/**
 * Zod schema for Todo validation
 */
export const TodoSchema = z.object({
  id: z.string().min(1, "Todo ID is required"),
  text: z.string().min(1, "Todo text is required"),
  completed: z.boolean(),
});

/**
 * A single TODO item for a workspace
 */
export interface Todo {
  /** Unique identifier for this todo */
  id: string;

  /** The todo text */
  text: string;

  /** Whether the todo is completed */
  completed: boolean;
}

/**
 * Discriminated union for todo operations
 */
export type TodoOperation =
  | { type: "add"; todoId: string; text: string }
  | { type: "remove"; todoId: string }
  | { type: "toggle"; todoId: string };
