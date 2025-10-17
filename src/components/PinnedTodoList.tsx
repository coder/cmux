import React, { useSyncExternalStore, useState, useEffect } from "react";
import styled from "@emotion/styled";
import { TodoList } from "./TodoList";
import { useWorkspaceStoreRaw } from "@/stores/WorkspaceStore";
import { usePersistedState } from "@/hooks/usePersistedState";

const PinnedContainer = styled.div<{ isExiting: boolean }>`
  background: var(--color-panel-background);
  border-top: 1px dashed hsl(0deg 0% 28.64%);
  margin: 0;
  max-height: 300px;
  overflow-y: auto;

  /* Enter animation: fade in + slide up */
  animation: ${(props) =>
    props.isExiting
      ? "slideDown 200ms ease-out forwards"
      : "slideUp 200ms ease-out forwards"};

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(8px);
      max-height: 0;
    }
    to {
      opacity: 1;
      transform: translateY(0);
      max-height: 300px;
    }
  }

  @keyframes slideDown {
    from {
      opacity: 1;
      transform: translateY(0);
      max-height: 300px;
    }
    to {
      opacity: 0;
      transform: translateY(8px);
      max-height: 0;
    }
  }
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
 * Animates in with fade + slide up, animates out with fade + slide down.
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

  // Track exit animation state to delay unmount
  const [isVisible, setIsVisible] = useState(todos.length > 0);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    if (todos.length > 0) {
      // Entering: show immediately
      setIsVisible(true);
      setIsExiting(false);
    } else if (isVisible) {
      // Exiting: start animation, then hide after delay
      setIsExiting(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setIsExiting(false);
      }, 200); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [todos.length, isVisible]);

  if (!isVisible) {
    return null;
  }

  return (
    <PinnedContainer isExiting={isExiting}>
      <TodoHeader onClick={() => setExpanded(!expanded)}>
        <Caret expanded={expanded}>▶</Caret>
        TODO{expanded ? ":" : ""}
      </TodoHeader>
      {expanded && <TodoList todos={todos} />}
    </PinnedContainer>
  );
};
