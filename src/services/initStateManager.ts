import { EventEmitter } from "events";
import type { Config } from "@/config";
import { EventStore } from "@/utils/eventStore";
import type { WorkspaceInitEvent } from "@/types/ipc";
import { log } from "@/services/log";

/**
 * Persisted state for init hooks.
 * Stored in ~/.cmux/sessions/{workspaceId}/init-status.json
 */
export interface InitStatus {
  status: "running" | "success" | "error";
  hookPath: string;
  startTime: number;
  lines: string[]; // Accumulated output (stderr prefixed with "ERROR: ")
  exitCode: number | null;
  endTime: number | null; // When init-end event occurred
}

/**
 * In-memory state for active init hooks.
 * Extends InitStatus with event emission tracking.
 */
interface InitHookState extends InitStatus {
  // No additional fields needed for now, but keeps type separate for future extension
}

/**
 * InitStateManager - Manages init hook lifecycle with persistence and replay.
 *
 * Uses EventStore abstraction for state management:
 * - In-memory Map for active init hooks (via EventStore)
 * - Disk persistence to init-status.json for replay across page reloads
 * - EventEmitter for streaming events to AgentSession
 * - Permanent storage (never auto-deleted, unlike stream partials)
 *
 * Key differences from StreamManager:
 * - Simpler state machine (running → success/error, no abort)
 * - No throttling (init hooks emit discrete lines, not streaming tokens)
 * - Permanent persistence (init logs kept forever as workspace metadata)
 *
 * Lifecycle:
 * 1. startInit() - Create in-memory state, emit init-start
 * 2. appendOutput() - Accumulate lines, emit init-output
 * 3. endInit() - Finalize state, write to disk, emit init-end
 * 4. State remains in memory until cleared or process restart
 * 5. replayInit() - Re-emit events from in-memory or disk state (via EventStore)
 */
export class InitStateManager extends EventEmitter {
  private readonly store: EventStore<InitHookState, WorkspaceInitEvent & { workspaceId: string }>;

  constructor(config: Config) {
    super();
    this.store = new EventStore(
      config,
      "init-status.json",
      (state) => this.serializeInitEvents(state),
      (event) => this.emit(event.type, event),
      "InitStateManager"
    );
  }

  /**
   * Serialize InitHookState into array of events for replay.
   * Used by EventStore.replay() to reconstruct the event stream.
   */
  private serializeInitEvents(
    state: InitHookState & { workspaceId?: string }
  ): (WorkspaceInitEvent & { workspaceId: string })[] {
    const events: (WorkspaceInitEvent & { workspaceId: string })[] = [];
    const workspaceId = state.workspaceId ?? "unknown";

    // Emit init-start
    events.push({
      type: "init-start",
      workspaceId,
      hookPath: state.hookPath,
      timestamp: state.startTime,
    });

    // Emit init-output for each accumulated line
    for (const line of state.lines) {
      const isError = line.startsWith("ERROR: ");
      const cleanLine = isError ? line.slice(7) : line;

      events.push({
        type: "init-output",
        workspaceId,
        line: cleanLine,
        isError,
        timestamp: state.startTime, // Use original timestamp for replay
      });
    }

    // Emit init-end (only if completed)
    if (state.exitCode !== null) {
      events.push({
        type: "init-end",
        workspaceId,
        exitCode: state.exitCode,
        timestamp: state.endTime ?? state.startTime,
      });
    }

    return events;
  }

  /**
   * Start tracking a new init hook execution.
   * Creates in-memory state and emits init-start event.
   */
  startInit(workspaceId: string, hookPath: string): void {
    const startTime = Date.now();

    const state: InitHookState = {
      status: "running",
      hookPath,
      startTime,
      lines: [],
      exitCode: null,
      endTime: null,
    };

    this.store.setState(workspaceId, state);

    log.debug(`Init hook started for workspace ${workspaceId}: ${hookPath}`);

    // Emit init-start event
    this.emit("init-start", {
      type: "init-start",
      workspaceId,
      hookPath,
      timestamp: startTime,
    } satisfies WorkspaceInitEvent & { workspaceId: string });
  }

  /**
   * Append output line from init hook.
   * Accumulates in state and emits init-output event.
   */
  appendOutput(workspaceId: string, line: string, isError: boolean): void {
    const state = this.store.getState(workspaceId);

    if (!state) {
      log.error(`appendOutput called for workspace ${workspaceId} with no active init state`);
      return;
    }

    // Prefix stderr lines with "ERROR: " for visual distinction
    const displayLine = isError ? `ERROR: ${line}` : line;
    state.lines.push(displayLine);

    // Emit init-output event
    this.emit("init-output", {
      type: "init-output",
      workspaceId,
      line,
      isError,
      timestamp: Date.now(),
    } satisfies WorkspaceInitEvent & { workspaceId: string });
  }

  /**
   * Finalize init hook execution.
   * Updates state, persists to disk, and emits init-end event.
   */
  async endInit(workspaceId: string, exitCode: number): Promise<void> {
    const state = this.store.getState(workspaceId);

    if (!state) {
      log.error(`endInit called for workspace ${workspaceId} with no active init state`);
      return;
    }

    const endTime = Date.now();
    state.status = exitCode === 0 ? "success" : "error";
    state.exitCode = exitCode;
    state.endTime = endTime;

    // Persist to disk (fire-and-forget, errors logged internally by EventStore)
    await this.store.persist(workspaceId, state);

    log.info(
      `Init hook ${state.status} for workspace ${workspaceId} (exit code ${exitCode}, duration ${endTime - state.startTime}ms)`
    );

    // Emit init-end event
    this.emit("init-end", {
      type: "init-end",
      workspaceId,
      exitCode,
      timestamp: endTime,
    } satisfies WorkspaceInitEvent & { workspaceId: string });

    // Keep state in memory for replay (unlike streams which delete immediately)
  }

  /**
   * Get current in-memory init state for a workspace.
   * Returns undefined if no init state exists.
   */
  getInitState(workspaceId: string): InitHookState | undefined {
    return this.store.getState(workspaceId);
  }

  /**
   * Read persisted init status from disk.
   * Returns null if no status file exists.
   */
  async readInitStatus(workspaceId: string): Promise<InitStatus | null> {
    return this.store.readPersisted(workspaceId);
  }

  /**
   * Replay init events for a workspace.
   * Delegates to EventStore.replay() which:
   * 1. Checks in-memory state first, then falls back to disk
   * 2. Serializes state into events via serializeInitEvents()
   * 3. Emits events (init-start, init-output*, init-end)
   *
   * This is called during AgentSession.emitHistoricalEvents() to ensure
   * init state is visible after page reloads.
   */
  async replayInit(workspaceId: string): Promise<void> {
    // Pass workspaceId as context for serialization
    await this.store.replay(workspaceId, { workspaceId });
  }

  /**
   * Delete persisted init status from disk.
   * Useful for testing or manual cleanup.
   * Does NOT clear in-memory state (for active replay).
   */
  async deleteInitStatus(workspaceId: string): Promise<void> {
    await this.store.deletePersisted(workspaceId);
  }

  /**
   * Clear in-memory state for a workspace.
   * Useful for testing or cleanup after workspace deletion.
   * Does NOT delete disk file (use deleteInitStatus for that).
   */
  clearInMemoryState(workspaceId: string): void {
    this.store.deleteState(workspaceId);
  }
}
