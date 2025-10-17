import React, { useSyncExternalStore } from "react";
import styled from "@emotion/styled";
import { TodoList } from "./TodoList";
import { useWorkspaceStoreRaw } from "@/stores/WorkspaceStore";
import { usePersistedState } from "@/hooks/usePersistedState";

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
 * Pinned TODO list displayed at bottom of chat (before StreamingBarrier).
 * Shows current TODOs from active stream only.
 * Reuses TodoList component for consistent styling.
 *
 * Relies on natural reference stability from MapStore + Aggregator architecture:
 * - Aggregator.getCurrentTodos() returns direct reference (not a copy)
 * - Reference only changes when todos are actually modified
 * - MapStore caches WorkspaceState per version, avoiding unnecessary recomputation
 */
export const PinnedTodoList: React.FC<PinnedTodoListProps> = ({ workspaceId }) => {
  const [expanded, setExpanded] = usePersistedState("pinnedTodoExpanded", true);

  const workspaceStore = useWorkspaceStoreRaw();
  const todos = useSyncExternalStore(
    (callback) => workspaceStore.subscribeKey(workspaceId, callback),
    () => workspaceStore.getWorkspaceState(workspaceId).todos
  );

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
