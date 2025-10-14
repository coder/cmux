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
  gap: 8px;
  padding: 8px;
`;

const TodoItemContainer = styled.div<{ status: TodoItem["status"] }>`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 12px;
  background: ${(props) => {
    switch (props.status) {
      case "completed":
        return "color-mix(in srgb, #4caf50, transparent 90%)";
      case "in_progress":
        return "color-mix(in srgb, #2196f3, transparent 90%)";
      case "pending":
      default:
        return "color-mix(in srgb, #888, transparent 95%)";
    }
  }};
  border-left: 3px solid
    ${(props) => {
      switch (props.status) {
        case "completed":
          return "#4caf50";
        case "in_progress":
          return "#2196f3";
        case "pending":
        default:
          return "#888";
      }
    }};
  border-radius: 4px;
  font-family: var(--font-monospace);
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text);
`;

const TodoIcon = styled.div`
  font-size: 14px;
  flex-shrink: 0;
  margin-top: 2px;
`;

const TodoContent = styled.div`
  flex: 1;
`;

const TodoText = styled.div<{ status: TodoItem["status"] }>`
  color: ${(props) => (props.status === "completed" ? "#888" : "var(--color-text)")};
  text-decoration: ${(props) => (props.status === "completed" ? "line-through" : "none")};
`;

const TodoActiveForm = styled.div`
  color: #2196f3;
  font-weight: 500;
  margin-top: 2px;
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
                  <TodoText status={todo.status}>{todo.content}</TodoText>
                  {todo.status === "in_progress" && (
                    <TodoActiveForm>{todo.activeForm}</TodoActiveForm>
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
