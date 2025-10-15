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
      <TodoList todos={todos} />
    </PinnedContainer>
  );
};
