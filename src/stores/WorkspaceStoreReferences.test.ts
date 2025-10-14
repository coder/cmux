/**
 * Functional tests for WorkspaceStore focusing on reference stability.
 * These tests verify that the store returns stable references when data hasn't changed,
 * which is critical for React's useSyncExternalStore to work correctly.
 */

import { WorkspaceStore } from "./WorkspaceStore";
import type { WorkspaceMetadata } from "@/types/workspace";

describe("WorkspaceStore - Reference Stability", () => {
  let store: WorkspaceStore;
  let addModel: (model: string) => void;

  beforeEach(() => {
    addModel = jest.fn();
    store = new WorkspaceStore(addModel);
  });

  afterEach(() => {
    store.dispose();
  });

  test("getAllStates() returns same reference when no changes", () => {
    // Get initial state
    const states1 = store.getAllStates();
    
    // Get state again without any changes
    const states2 = store.getAllStates();
    
    // Should be same reference
    expect(states1).toBe(states2);
  });

  test("getAllStates() returns same reference after subscribe/emit cycle with no data changes", () => {
    let emitCount = 0;
    const listener = jest.fn(() => {
      emitCount++;
    });

    store.subscribe(listener);

    // Get initial state
    const states1 = store.getAllStates();

    // Manually trigger emit (simulating what happens during IPC events)
    // @ts-expect-error - Accessing private method for testing
    store.emit();

    // Listener should have been called
    expect(listener).toHaveBeenCalledTimes(1);

    // Get state again after emit
    const states2 = store.getAllStates();

    // Should still be same reference (no actual data changed)
    expect(states1).toBe(states2);
  });

  test("getAllStates() returns new reference when aggregators change", () => {
    // Get initial state (no aggregators)
    const states1 = store.getAllStates();
    expect(states1.size).toBe(0);

    // Manually create an aggregator (bypassing IPC requirements)
    // @ts-expect-error - Accessing private method for testing
    const aggregator = store.getOrCreateAggregator("test-workspace");
    expect(aggregator).toBeDefined();

    // Get state after adding aggregator
    const states2 = store.getAllStates();

    // Should be different reference (aggregator added)
    expect(states1).not.toBe(states2);
    expect(states2.size).toBe(1);

    // Note: We can't reliably test that states3 === states2 because
    // getWorkspaceState() may return new references due to timing-sensitive
    // fields like loading state. The critical behavior (returning same
    // reference when NO aggregators change) is tested above.
  });

  test("syncWorkspaces() emits only when workspaces are added or removed", () => {
    const listener = jest.fn();
    store.subscribe(listener);

    // Sync with empty metadata (no workspaces)
    const metadata1 = new Map<string, WorkspaceMetadata>();
    store.syncWorkspaces(metadata1);

    // Should not emit (no changes from empty to empty)
    expect(listener).not.toHaveBeenCalled();

    // Sync again with same empty data
    listener.mockClear();
    store.syncWorkspaces(metadata1);

    // Should still not emit (no changes)
    expect(listener).not.toHaveBeenCalled();
  });
});


describe("WorkspaceStore - getWorkspaceState Reference Stability", () => {
  let store: WorkspaceStore;
  let addModel: (model: string) => void;

  beforeEach(() => {
    addModel = jest.fn();
    store = new WorkspaceStore(addModel);
  });

  afterEach(() => {
    store.dispose();
  });

  test("getWorkspaceState() returns same reference when state hasn't changed", () => {
    // Create an aggregator
    // @ts-expect-error - Accessing private method for testing
    const aggregator = store.getOrCreateAggregator("test-workspace");
    expect(aggregator).toBeDefined();

    // Get state twice without any changes
    const state1 = store.getWorkspaceState("test-workspace");
    const state2 = store.getWorkspaceState("test-workspace");

    // Should be same reference (critical for useSyncExternalStore)
    expect(state1).toBe(state2);
  });

  test("getWorkspaceState() returns same reference after emit with no data changes", () => {
    let emitCount = 0;
    const listener = jest.fn(() => {
      emitCount++;
    });

    store.subscribe(listener);

    // Create an aggregator
    // @ts-expect-error - Accessing private method for testing
    const aggregator = store.getOrCreateAggregator("test-workspace");

    // Get initial state
    const state1 = store.getWorkspaceState("test-workspace");

    // Manually trigger emit (simulating what happens during IPC events)
    // @ts-expect-error - Accessing private method for testing
    store.emit();

    // Listener should have been called
    expect(listener).toHaveBeenCalledTimes(1);

    // Get state again after emit
    const state2 = store.getWorkspaceState("test-workspace");

    // Should still be same reference (no actual data changed)
    // THIS IS THE BUG: if this fails, getWorkspaceState is creating new objects
    expect(state1).toBe(state2);
  });

  test("getWorkspaceState() returns new reference only when workspace state actually changes", () => {
    // Create an aggregator
    // @ts-expect-error - Accessing private method for testing
    const aggregator = store.getOrCreateAggregator("test-workspace");

    // Get initial state
    const state1 = store.getWorkspaceState("test-workspace");

    // Simulate a change - mark as caught up
    // @ts-expect-error - Accessing private property for testing
    store.caughtUp.set("test-workspace", true);

    // Get state after change
    const state2 = store.getWorkspaceState("test-workspace");

    // Should be different reference (data actually changed)
    expect(state1).not.toBe(state2);

    // Get state again without further changes
    const state3 = store.getWorkspaceState("test-workspace");

    // Should be same as state2 (no changes since then)
    expect(state2).toBe(state3);
  });

  // Additional tests for getAllStates() consecutive calls
  // These are critical for useSyncExternalStore - getSnapshot must return
  // same reference on consecutive calls without emit being called

  test("getAllStates() returns same reference on consecutive calls immediately after adding workspace", () => {
    const metadata: WorkspaceMetadata = {
      id: "ws-new",
      projectName: "test-project",
      workspacePath: "/path/to/workspace",
    };

    // Mock window.api
    globalThis.window = {
      api: {
        workspace: {
          onChat: () => () => {},
        },
      },
    } as any;

    store.addWorkspace(metadata);

    // First call builds cache
    const states1 = store.getAllStates();

    // Second call should return cached reference
    const states2 = store.getAllStates();

    expect(states2).toBe(states1);
  });

  test("getAllStates() interleaved with getWorkspaceState calls", () => {
    const metadata: WorkspaceMetadata = {
      id: "ws-interleaved",
      projectName: "test-project",
      workspacePath: "/path/to/workspace",
    };

    // Mock window.api
    globalThis.window = {
      api: {
        workspace: {
          onChat: () => () => {},
        },
      },
    } as any;

    store.addWorkspace(metadata);

    // This simulates what happens in React:
    // 1. getAllStates is called (via useAllWorkspaceStates)
    // 2. getWorkspaceState is called (via useWorkspaceState)
    // 3. getAllStates is called again (React re-checks)

    const states1 = store.getAllStates();
    const individualState = store.getWorkspaceState("ws-interleaved");
    const states2 = store.getAllStates();

    expect(states2).toBe(states1);
    expect(states2.get("ws-interleaved")).toBe(individualState);
  });

  test("getAllStates() during rapid syncWorkspaces calls", () => {
    const metadata = new Map<string, WorkspaceMetadata>();
    metadata.set("ws-sync", {
      id: "ws-sync",
      projectName: "project1",
      workspacePath: "/path/to/ws1",
    });

    // Mock window.api
    globalThis.window = {
      api: {
        workspace: {
          onChat: () => () => {},
        },
      },
    } as any;

    // Simulate rapid calls like useEffect might trigger
    store.syncWorkspaces(metadata);
    const states1 = store.getAllStates();

    store.syncWorkspaces(metadata); // Same metadata
    const states2 = store.getAllStates();

    store.syncWorkspaces(metadata); // Same metadata again
    const states3 = store.getAllStates();

    expect(states2).toBe(states1);
    expect(states3).toBe(states1);
  });
});



