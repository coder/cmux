import React from "react";
import styled from "@emotion/styled";
import type { TodoWriteToolArgs, TodoWriteToolResult, TodoItem } from "@/types/tools";
import {
  ToolContainer,
  ToolHeader,
  ExpandIcon,
  ToolName,
  StatusIndicator,
  ToolDetails,
} from "./shared/ToolPrimitives";
import { useToolExpansion, getStatusDisplay, type ToolStatus } from "./shared/toolUtils";

const TodoList = styled.div`
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
  display: inline-block;

  &::after {
    content: "...";
    display: inline-block;
    width: 1em;
    overflow: hidden;
    vertical-align: bottom;
    animation: ellipsis 1.5s steps(4, end) infinite;
  }

  @keyframes ellipsis {
    0% {
      width: 0;
    }
    100% {
      width: 1em;
    }
  }
`;

interface TodoToolCallProps {
  args: TodoWriteToolArgs;
  result?: TodoWriteToolResult;
  status?: ToolStatus;
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

export const TodoToolCall: React.FC<TodoToolCallProps> = ({
  args,
  result: _result,
  status = "pending",
}) => {
  const { expanded, toggleExpanded } = useToolExpansion(true); // Expand by default
  const statusDisplay = getStatusDisplay(status);

  return (
    <ToolContainer expanded={expanded}>
      <ToolHeader onClick={toggleExpanded}>
        <ExpandIcon expanded={expanded}>▶</ExpandIcon>
        <ToolName>todo_write</ToolName>
        <StatusIndicator status={status}>{statusDisplay}</StatusIndicator>
      </ToolHeader>

      {expanded && (
        <ToolDetails>
          <TodoList>
            {args.todos.map((todo, index) => (
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
          </TodoList>
        </ToolDetails>
      )}
    </ToolContainer>
  );
};
