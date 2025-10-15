import React from "react";
import styled from "@emotion/styled";
import type { TodoItem } from "@/types/tools";

const TodoListContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 6px 8px;
`;

const TodoItemContainer = styled.div<{ status: TodoItem["status"] }>`
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
  font-size: 11px;
  line-height: 1.35;
  color: var(--color-text);
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

const TodoText = styled.div<{ status: TodoItem["status"] }>`
  color: ${(props) => (props.status === "completed" ? "#888" : "var(--color-text)")};
  text-decoration: ${(props) => (props.status === "completed" ? "line-through" : "none")};
  opacity: ${(props) => (props.status === "completed" ? "0.7" : "1")};
`;

const TodoActiveForm = styled.div`
  color: #2196f3;
  font-weight: 500;
  font-size: 11px;
  opacity: 0.95;
  white-space: nowrap;

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
 * Shared TODO list component used by:
 * - TodoToolCall (in expanded tool history)
 * - PinnedTodoList (pinned at bottom of chat)
 */
export const TodoList: React.FC<TodoListProps> = ({ todos }) => {
  return (
    <TodoListContainer>
      {todos.map((todo, index) => (
        <TodoItemContainer key={index} status={todo.status}>
          <TodoIcon>{getStatusIcon(todo.status)}</TodoIcon>
          <TodoContent>
            {todo.status === "in_progress" ? (
              <TodoActiveForm>{todo.activeForm}</TodoActiveForm>
            ) : (
              <TodoText status={todo.status}>{todo.content}</TodoText>
            )}
          </TodoContent>
        </TodoItemContainer>
      ))}
    </TodoListContainer>
  );
};
