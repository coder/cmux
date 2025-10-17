import React, { useSyncExternalStore, useMemo, useRef } from "react";
import styled from "@emotion/styled";
import { TodoList } from "./TodoList";
import { useWorkspaceStoreRaw } from "@/stores/WorkspaceStore";
import { usePersistedState } from "@/hooks/usePersistedState";
import type { TodoItem } from "@/types/tools";

const PinnedContainer = styled.div`
  background: var(--color-panel-background);
  border-top: 1px dashed hsl(0deg 0% 28.64%);
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
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 4px;

  &:hover {
    opacity: 0.8;
  }
`;

const Caret = styled.span<{ expanded: boolean }>`
  display: inline-block;
  transition: transform 0.2s;
  transform: ${(props) => (props.expanded ? "rotate(90deg)" : "rotate(0deg)")};
  font-size: 8px;
`;

interface PinnedTodoListProps {
  workspaceId: string;
}

/**
 * Compare two TODO arrays by content, not reference.
 * Returns true if arrays have the same items in the same order.
 */
function areArraysEqual(a: TodoItem[], b: TodoItem[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, i) => item.content === b[i].content && item.status === b[i].status);
}

/**
 * Pinned TODO list displayed at bottom of chat (before StreamingBarrier).
 * Shows current TODOs from active stream only.
 * Reuses TodoList component for consistent styling.
 *
 * Memoizes todos array to prevent re-renders when contents haven't changed,
 * even if the array reference is new (which happens when WorkspaceState recomputes).
 */
export const PinnedTodoList: React.FC<PinnedTodoListProps> = ({ workspaceId }) => {
  const [expanded, setExpanded] = usePersistedState("pinnedTodoExpanded", true);

  // Subscribe to workspace state and extract todos
  const workspaceStore = useWorkspaceStoreRaw();
  const todosSnapshot = useSyncExternalStore(
    (callback) => workspaceStore.subscribeKey(workspaceId, callback),
    () => workspaceStore.getWorkspaceState(workspaceId).todos
  );

  // Memoize todos to return stable reference when contents haven't changed
  // This prevents unnecessary re-renders of TodoList child component
  const prevTodosRef = useRef<TodoItem[]>(todosSnapshot);
  const todos = useMemo(() => {
    if (areArraysEqual(prevTodosRef.current, todosSnapshot)) {
      return prevTodosRef.current;
    }
    prevTodosRef.current = todosSnapshot;
    return todosSnapshot;
  }, [todosSnapshot]);

  // Don't render if no TODOs
  if (todos.length === 0) {
    return null;
  }

  return (
    <PinnedContainer>
      <TodoHeader onClick={() => setExpanded(!expanded)}>
        <Caret expanded={expanded}>▶</Caret>
        TODO{expanded ? ":" : ""}
      </TodoHeader>
      {expanded && <TodoList todos={todos} />}
    </PinnedContainer>
  );
};
