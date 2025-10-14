import { GitStatusStore } from "./GitStatusStore";
import type { WorkspaceMetadata, GitStatus } from "@/types/workspace";

/**
 * Unit tests for GitStatusStore.
 *
 * Tests cover:
 * - Subscription/unsubscription
 * - syncWorkspaces adding/removing workspaces
 * - getStatus caching (returns same reference if unchanged)
 * - getAllStatuses caching (returns same reference if no changes)
 * - Status change detection
 * - Cleanup on dispose
 */

describe("GitStatusStore", () => {
  let store: GitStatusStore;

  beforeEach(() => {
    store = new GitStatusStore();
  });

  afterEach(() => {
    store.dispose();
  });

  test("subscribe and unsubscribe", () => {
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);

    expect(typeof unsubscribe).toBe("function");

    // Unsubscribe
    unsubscribe();

    // Ensure we can call unsubscribe multiple times without error
    unsubscribe();
  });

  test("syncWorkspaces initializes metadata", () => {
    const metadata = new Map<string, WorkspaceMetadata>([
      [
        "ws1",
        {
          id: "ws1",
          projectName: "test-project",
          workspacePath: "/home/user/.cmux/src/test-project/main",
        },
      ],
    ]);

    store.syncWorkspaces(metadata);

    // Should have empty status initially
    const status = store.getStatus("ws1");
    expect(status).toBeNull();
  });

  test("syncWorkspaces removes deleted workspaces", () => {
    const metadata1 = new Map<string, WorkspaceMetadata>([
      [
        "ws1",
        {
          id: "ws1",
          projectName: "test-project",
          workspacePath: "/home/user/.cmux/src/test-project/main",
        },
      ],
      [
        "ws2",
        {
          id: "ws2",
          projectName: "test-project",
          workspacePath: "/home/user/.cmux/src/test-project/feature",
        },
      ],
    ]);

    store.syncWorkspaces(metadata1);

    // Simulate status updates (directly manipulate internal state for testing)
    const allStatuses1 = store.getAllStatuses();
    expect(allStatuses1.size).toBe(0); // Initially empty

    // Remove ws2
    const metadata2 = new Map<string, WorkspaceMetadata>([
      [
        "ws1",
        {
          id: "ws1",
          projectName: "test-project",
          workspacePath: "/home/user/.cmux/src/test-project/main",
        },
      ],
    ]);

    store.syncWorkspaces(metadata2);

    // ws2 should be removed from status cache
    const status2 = store.getStatus("ws2");
    expect(status2).toBeNull();
  });

  test("getStatus caching returns same reference if unchanged", () => {
    const listener = jest.fn();
    store.subscribe(listener);

    const metadata = new Map<string, WorkspaceMetadata>([
      [
        "ws1",
        {
          id: "ws1",
          projectName: "test-project",
          workspacePath: "/home/user/.cmux/src/test-project/main",
        },
      ],
    ]);

    store.syncWorkspaces(metadata);

    // Get status twice
    const status1 = store.getStatus("ws1");
    const status2 = store.getStatus("ws1");

    // Should return same reference (both null)
    expect(status1).toBe(status2);
    expect(status1).toBeNull();
  });

  test("getAllStatuses caching returns same reference if no changes", () => {
    const metadata = new Map<string, WorkspaceMetadata>([
      [
        "ws1",
        {
          id: "ws1",
          projectName: "test-project",
          workspacePath: "/home/user/.cmux/src/test-project/main",
        },
      ],
    ]);

    store.syncWorkspaces(metadata);

    // Get all statuses twice
    const allStatuses1 = store.getAllStatuses();
    const allStatuses2 = store.getAllStatuses();

    // Should return same reference
    expect(allStatuses1).toBe(allStatuses2);
  });

  test("dispose cleans up resources", () => {
    const listener = jest.fn();
    store.subscribe(listener);

    const metadata = new Map<string, WorkspaceMetadata>([
      [
        "ws1",
        {
          id: "ws1",
          projectName: "test-project",
          workspacePath: "/home/user/.cmux/src/test-project/main",
        },
      ],
    ]);

    store.syncWorkspaces(metadata);

    // Dispose
    store.dispose();

    // Subsequent operations should not throw
    const status = store.getStatus("ws1");
    expect(status).toBeNull();

    const allStatuses = store.getAllStatuses();
    expect(allStatuses.size).toBe(0);
  });

  test("status change detection", () => {
    const listener = jest.fn();
    store.subscribe(listener);

    const metadata = new Map<string, WorkspaceMetadata>([
      [
        "ws1",
        {
          id: "ws1",
          projectName: "test-project",
          workspacePath: "/home/user/.cmux/src/test-project/main",
        },
      ],
    ]);

    store.syncWorkspaces(metadata);

    // Initially null
    const status1 = store.getStatus("ws1");
    expect(status1).toBeNull();

    // Note: We can't easily test status updates without mocking IPC
    // The store relies on window.api.workspace.executeBash which doesn't exist in test environment
    // Real integration tests would need to mock this API
  });

  test("emit only when workspaces are removed", () => {
    const listener = jest.fn();
    const unsub = store.subscribe(listener);

    const metadata1 = new Map<string, WorkspaceMetadata>([
      [
        "ws1",
        {
          id: "ws1",
          projectName: "test-project",
          workspacePath: "/home/user/.cmux/src/test-project/main",
        },
      ],
    ]);

    // First sync - no workspaces exist yet, so no removal, no emit
    store.syncWorkspaces(metadata1);
    expect(listener).not.toHaveBeenCalled();

    // Manually add a workspace to the internal map to simulate it existing
    // (normally this would happen via polling, but we can't poll in tests without window.api)
    // @ts-expect-error - Accessing private field for testing
    store.gitStatusMap.set("ws1", { ahead: 0, behind: 0, dirty: false });

    listener.mockClear();

    // Sync with empty metadata to remove ws1
    const metadata2 = new Map<string, WorkspaceMetadata>();
    store.syncWorkspaces(metadata2);

    // Listener should be called (workspace removed)
    expect(listener).toHaveBeenCalledTimes(1);

    listener.mockClear();

    // Sync again with same empty metadata (no changes)
    store.syncWorkspaces(metadata2);

    // Listener should NOT be called (no changes)
    expect(listener).not.toHaveBeenCalled();

    unsub();
  });
});

