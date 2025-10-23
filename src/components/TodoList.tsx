import React from "react";
import { cn } from "@/lib/utils";
import type { TodoItem } from "@/types/tools";

const statusBgColors: Record<TodoItem["status"], string> = {
  completed: "color-mix(in srgb, #4caf50, transparent 92%)",
  in_progress: "color-mix(in srgb, #2196f3, transparent 92%)",
  pending: "color-mix(in srgb, #888, transparent 96%)",
};

const statusBorderColors: Record<TodoItem["status"], string> = {
  completed: "#4caf50",
  in_progress: "#2196f3",
  pending: "#666",
};

const statusTextColors: Record<TodoItem["status"], string> = {
  completed: "#888",
  in_progress: "#2196f3",
  pending: "theme(colors.gray.200)",
};

/**
 * Calculate opacity fade for items distant from the center (exponential decay).
 * @param distance - How far from the center (higher = more fade)
 * @param minOpacity - Minimum opacity floor
 * @returns Opacity value between minOpacity and 1.0
 */
function calculateFadeOpacity(distance: number, minOpacity: number): number {
  return Math.max(minOpacity, 1 - distance * 0.15);
}

function calculateTextOpacity(
  status: TodoItem["status"],
  completedIndex?: number,
  totalCompleted?: number,
  pendingIndex?: number,
  totalPending?: number
): number {
  if (status === "completed") {
    // Apply gradient fade for old completed items (distant past)
    if (
      completedIndex !== undefined &&
      totalCompleted !== undefined &&
      totalCompleted > 2 &&
      completedIndex < totalCompleted - 2
    ) {
      const distance = totalCompleted - completedIndex;
      return calculateFadeOpacity(distance, 0.35);
    }
    return 0.7;
  }
  if (status === "pending") {
    // Apply gradient fade for far future pending items (distant future)
    if (
      pendingIndex !== undefined &&
      totalPending !== undefined &&
      totalPending > 2 &&
      pendingIndex > 1
    ) {
      const distance = pendingIndex - 1;
      return calculateFadeOpacity(distance, 0.5);
    }
  }
  return 1;
}

interface TodoListProps {
  todos: TodoItem[];
}

function getStatusIcon(status: TodoItem["status"]): string {
  switch (status) {
    case "completed":
      return "✓";
    case "in_progress":
      return "⏳";
    case "pending":
    default:
      return "○";
  }
}

/**
 * Shared TODO list component used by:
 * - TodoToolCall (in expanded tool history)
 * - PinnedTodoList (pinned at bottom of chat)
 */
export const TodoList: React.FC<TodoListProps> = ({ todos }) => {
  // Count completed and pending items for fade effects
  const completedCount = todos.filter((t) => t.status === "completed").length;
  const pendingCount = todos.filter((t) => t.status === "pending").length;
  let completedIndex = 0;
  let pendingIndex = 0;

  return (
    <div className="flex flex-col gap-[3px] px-2 py-1.5">
      {todos.map((todo, index) => {
        const currentCompletedIndex = todo.status === "completed" ? completedIndex++ : undefined;
        const currentPendingIndex = todo.status === "pending" ? pendingIndex++ : undefined;

        const textOpacity = calculateTextOpacity(
          todo.status,
          currentCompletedIndex,
          completedCount,
          currentPendingIndex,
          pendingCount
        );

        return (
          <div
            key={index}
            className="font-monospace flex items-start gap-1.5 rounded border-l-2 px-2 py-1 text-[11px] leading-[1.35]"
            style={{
              background: statusBgColors[todo.status],
              borderLeftColor: statusBorderColors[todo.status],
              color: "theme(colors.gray.200)",
            }}
          >
            <div className="mt-px shrink-0 text-xs opacity-80">{getStatusIcon(todo.status)}</div>
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "whitespace-nowrap",
                  todo.status === "completed" && "line-through",
                  todo.status === "in_progress" &&
                    "font-medium after:content-['...'] after:inline after:overflow-hidden after:animate-[ellipsis_1.5s_steps(4,end)_infinite]"
                )}
                style={{
                  color: statusTextColors[todo.status],
                  opacity: textOpacity,
                }}
              >
                {todo.content}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
