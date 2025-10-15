import React, { useSyncExternalStore } from "react";
import styled from "@emotion/styled";
import { TodoList } from "./TodoList";
import { useWorkspaceStoreRaw } from "@/stores/WorkspaceStore";

const PinnedContainer = styled.div`
  background: var(--color-panel-background);
  border-top: 1px solid var(--color-border);
  margin: 0;
  max-height: 300px;
  overflow-y: auto;
`;

const TodoHeader = styled.div`
  padding: 4px 8px 2px 8px;
  font-family: var(--font-monospace);
  font-size: 10px;
  color: var(--color-text-secondary);
  font-weight: 600;
  letter-spacing: 0.05em;
`;

interface PinnedTodoListProps {
  workspaceId: string;
}

/**
 * Pinned TODO list displayed at bottom of chat (before StreamingBarrier).
 * Shows current TODOs from active stream only.
 * Reuses TodoList component for consistent styling.
 */
export const PinnedTodoList: React.FC<PinnedTodoListProps> = ({ workspaceId }) => {
  const workspaceStore = useWorkspaceStoreRaw();

  // Subscribe to workspace state changes to re-render when TODOs update
  useSyncExternalStore(
    (callback) => workspaceStore.subscribeKey(workspaceId, callback),
    () => workspaceStore.getWorkspaceState(workspaceId)
  );

  // Get current TODOs (uses latest aggregator state)
  const todos = workspaceStore.getTodos(workspaceId);

  // Don't render if no TODOs
  if (todos.length === 0) {
    return null;
  }

  return (
    <PinnedContainer>
      <TodoHeader>TODO:</TodoHeader>
      <TodoList todos={todos} />
    </PinnedContainer>
  );
};
