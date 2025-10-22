import React, { useSyncExternalStore } from "react";
import { TodoList } from "./TodoList";
import { useWorkspaceStoreRaw } from "@/stores/WorkspaceStore";
import { usePersistedState } from "@/hooks/usePersistedState";
import { cn } from "@/lib/utils";

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
    <div className="bg-panel-background border-t border-dashed border-[hsl(0deg_0%_28.64%)] m-0 max-h-[300px] overflow-y-auto">
      <div
        className="px-2 pt-1 pb-0.5 font-mono text-[10px] text-text-secondary font-semibold tracking-wider cursor-pointer select-none flex items-center gap-1 hover:opacity-80"
        onClick={() => setExpanded(!expanded)}
      >
        <span
          className={cn(
            "inline-block transition-transform duration-200 text-[8px]",
            expanded ? "rotate-90" : "rotate-0"
          )}
        >
          ▶
        </span>
        TODO{expanded ? ":" : ""}
      </div>
      {expanded && <TodoList todos={todos} />}
    </div>
  );
};
