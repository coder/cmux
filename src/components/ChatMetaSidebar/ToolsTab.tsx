import React, { useState } from "react";
import styled from "@emotion/styled";
import { useWorkspaceMetadata } from "@/hooks/useWorkspaceMetadata";
import type { Todo } from "@/types/todo";

const Container = styled.div`
  color: #d4d4d4;
  font-family: var(--font-primary);
  font-size: 13px;
  line-height: 1.6;
`;

const AddTodoForm = styled.form`
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
`;

const Input = styled.input`
  flex: 1;
  background: #3c3c3c;
  border: 1px solid #3e3e42;
  border-radius: 4px;
  color: #cccccc;
  padding: 8px 12px;
  font-family: var(--font-primary);
  font-size: 13px;

  &:focus {
    outline: none;
    border-color: #007acc;
  }

  &::placeholder {
    color: #666666;
  }
`;

const AddButton = styled.button`
  background: #007acc;
  border: none;
  border-radius: 4px;
  color: #ffffff;
  padding: 8px 16px;
  font-family: var(--font-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover {
    background: #005a9e;
  }

  &:disabled {
    background: #3c3c3c;
    color: #666666;
    cursor: not-allowed;
  }
`;

const TodoList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

const TodoItem = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  background: #2d2d2d;
  border-radius: 4px;
  transition: background 0.2s ease;

  &:hover {
    background: #333333;
  }
`;

const Checkbox = styled.input`
  width: 16px;
  height: 16px;
  cursor: pointer;
  flex-shrink: 0;
`;

const TodoText = styled.span<{ completed: boolean }>`
  flex: 1;
  color: ${(props) => (props.completed ? "#666666" : "#cccccc")};
  text-decoration: ${(props) => (props.completed ? "line-through" : "none")};
  word-break: break-word;
`;

const DeleteButton = styled.button`
  background: transparent;
  border: none;
  color: #666666;
  cursor: pointer;
  padding: 4px 8px;
  font-size: 16px;
  transition: color 0.2s ease;
  flex-shrink: 0;

  &:hover {
    color: #f48771;
  }
`;

const EmptyState = styled.div`
  color: #888888;
  text-align: center;
  padding: 40px 20px;
  font-style: italic;
`;

interface ToolsTabProps {
  workspaceId: string;
}

export const ToolsTab: React.FC<ToolsTabProps> = ({ workspaceId }) => {
  const [newTodoText, setNewTodoText] = useState("");
  const metadata = useWorkspaceMetadata(workspaceId);

  const todos = metadata?.todos ?? [];

  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = newTodoText.trim();
    if (!text) return;

    const todoId = `todo-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    await window.api.workspace.todo(workspaceId, {
      type: "add",
      todoId,
      text,
    });

    setNewTodoText("");
  };

  const handleToggleTodo = async (todoId: string) => {
    await window.api.workspace.todo(workspaceId, {
      type: "toggle",
      todoId,
    });
  };

  const handleDeleteTodo = async (todoId: string) => {
    await window.api.workspace.todo(workspaceId, {
      type: "remove",
      todoId,
    });
  };

  return (
    <Container>
      <AddTodoForm onSubmit={handleAddTodo}>
        <Input
          type="text"
          placeholder="Add a new todo..."
          value={newTodoText}
          onChange={(e) => setNewTodoText(e.target.value)}
        />
        <AddButton type="submit" disabled={!newTodoText.trim()}>
          Add
        </AddButton>
      </AddTodoForm>

      {todos.length === 0 ? (
        <EmptyState>No todos yet. Add one above!</EmptyState>
      ) : (
        <TodoList>
          {todos.map((todo: Todo) => (
            <TodoItem key={todo.id}>
              <Checkbox
                type="checkbox"
                checked={todo.completed}
                onChange={() => handleToggleTodo(todo.id)}
              />
              <TodoText completed={todo.completed}>{todo.text}</TodoText>
              <DeleteButton onClick={() => handleDeleteTodo(todo.id)}>×</DeleteButton>
            </TodoItem>
          ))}
        </TodoList>
      )}
    </Container>
  );
};
