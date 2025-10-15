import React from "react";
import styled from "@emotion/styled";
import type { TodoItem } from "@/types/tools";

const TodoListContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 8px;
`;

const TodoItemContainer = styled.div<{ 
  status: TodoItem["status"]; 
  isSummary?: boolean;
}>`
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 4px 8px;
  background: ${(props) => {
    switch (props.status) {
      case "completed":
        return "color-mix(in srgb, #4caf50, transparent 92%)";
      case "in_progress":
        return "color-mix(in srgb, #2196f3, transparent 92%)";
      case "pending":
      default:
        return "color-mix(in srgb, #888, transparent 96%)";
    }
  }};
  border-left: 2px solid
    ${(props) => {
      switch (props.status) {
        case "completed":
          return "#4caf50";
        case "in_progress":
          return "#2196f3";
        case "pending":
        default:
          return "#666";
      }
    }};
  border-radius: 3px;
  font-family: var(--font-monospace);
  font-size: ${(props) => (props.isSummary ? "10px" : "11px")};
  line-height: 1.35;
  color: var(--color-text);
  font-style: ${(props) => (props.isSummary ? "italic" : "normal")};
`;

const TodoIcon = styled.div`
  font-size: 12px;
  flex-shrink: 0;
  margin-top: 1px;
  opacity: 0.8;
`;

const TodoContent = styled.div`
  flex: 1;
  min-width: 0;
`;

const TodoText = styled.div<{ 
  status: TodoItem["status"];
  completedIndex?: number;
  totalCompleted?: number;
  isSummary?: boolean;
}>`
  color: ${(props) => {
    switch (props.status) {
      case "completed":
        return "#888";
      case "in_progress":
        return "#2196f3";
      default:
        return "var(--color-text)";
    }
  }};
  text-decoration: ${(props) => (props.status === "completed" ? "line-through" : "none")};
  opacity: ${(props) => {
    if (props.status === "completed") {
      // Apply gradient fade for old completed items
      if (props.completedIndex !== undefined && 
          props.totalCompleted !== undefined && 
          props.totalCompleted > 2 &&
          props.completedIndex < props.totalCompleted - 2) {
        // Fade older items more (exponential decay)
        const recentIndex = props.totalCompleted - props.completedIndex;
        return Math.max(0.35, 1 - (recentIndex * 0.15));
      }
      return props.isSummary ? "0.5" : "0.7";
    }
    return props.isSummary ? "0.75" : "1";
  }};
  font-weight: ${(props) => (props.status === "in_progress" ? "500" : "normal")};
  white-space: nowrap;

  ${(props) =>
    props.status === "in_progress" &&
    `
    &::after {
      content: "...";
      display: inline;
      overflow: hidden;
      animation: ellipsis 1.5s steps(4, end) infinite;
    }

    @keyframes ellipsis {
      0% {
        content: "";
      }
      25% {
        content: ".";
      }
      50% {
        content: "..";
      }
      75% {
        content: "...";
      }
    }
  `}
`;

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
 * Detect if a TODO item is a summary based on content pattern.
 * Matches patterns like: "(N items)", "(N tasks)", "(N steps)"
 */
function isSummaryItem(content: string): boolean {
  return /\(\d+\s+(items?|tasks?|steps?)\)/i.test(content);
}

/**
 * Shared TODO list component used by:
 * - TodoToolCall (in expanded tool history)
 * - PinnedTodoList (pinned at bottom of chat)
 */
export const TodoList: React.FC<TodoListProps> = ({ todos }) => {
  // Count completed items for fade effect
  const completedCount = todos.filter((t) => t.status === "completed").length;
  let completedIndex = 0;

  return (
    <TodoListContainer>
      {todos.map((todo, index) => {
        const isSummary = isSummaryItem(todo.content);
        const currentCompletedIndex = todo.status === "completed" ? completedIndex++ : undefined;

        return (
          <TodoItemContainer key={index} status={todo.status} isSummary={isSummary}>
            <TodoIcon>{getStatusIcon(todo.status)}</TodoIcon>
            <TodoContent>
              <TodoText 
                status={todo.status}
                completedIndex={currentCompletedIndex}
                totalCompleted={completedCount}
                isSummary={isSummary}
              >
                {todo.content}
              </TodoText>
            </TodoContent>
          </TodoItemContainer>
        );
      })}
    </TodoListContainer>
  );
};
