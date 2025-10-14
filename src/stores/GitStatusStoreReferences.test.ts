/**
 * Reference stability tests for GitStatusStore.
 * These tests verify that the store returns stable references when data hasn't changed,
 * which is critical for React's useSyncExternalStore to work correctly.
 */

import { GitStatusStore } from "./GitStatusStore";
import type { WorkspaceMetadata, GitStatus } from "@/types/workspace";

describe("GitStatusStore - Reference Stability", () => {
  let store: GitStatusStore;

  beforeEach(() => {
    store = new GitStatusStore();
  });

  afterEach(() => {
    store.dispose();
  });

  test("getStatus() returns same reference when status hasn't changed", () => {
    // Get status twice without any changes (no workspaces = null)
    const status1 = store.getStatus("test-workspace");
    const status2 = store.getStatus("test-workspace");

    // Should be same reference
    expect(status1).toBe(status2);
    expect(status1).toBeNull(); // No workspace = null
  });

  test("getStatus() returns same reference after emit with no data changes", () => {
    const listener = jest.fn();
    store.subscribe(listener);

    // Get initial status
    const status1 = store.getStatus("test-workspace");

    // Manually trigger emit (simulating what happens during polling)
    // @ts-expect-error - Accessing private method for testing
    store.emit();

    // Listener should have been called
    expect(listener).toHaveBeenCalledTimes(1);

    // Get status again after emit
    const status2 = store.getStatus("test-workspace");

    // Should still be same reference (no actual data changed)
    expect(status1).toBe(status2);
  });

  test("getAllStatuses() returns same reference when no changes", () => {
    // Get initial statuses
    const statuses1 = store.getAllStatuses();
    
    // Get statuses again without any changes
    const statuses2 = store.getAllStatuses();
    
    // Should be same reference
    expect(statuses1).toBe(statuses2);
  });

  test("getAllStatuses() returns same reference after emit with no data changes", () => {
    const listener = jest.fn();
    store.subscribe(listener);

    // Get initial statuses
    const statuses1 = store.getAllStatuses();

    // Manually trigger emit
    // @ts-expect-error - Accessing private method for testing
    store.emit();

    // Listener should have been called
    expect(listener).toHaveBeenCalledTimes(1);

    // Get statuses again after emit
    const statuses2 = store.getAllStatuses();

    // Should still be same reference (no actual data changed)
    // THIS IS CRITICAL: if this fails, getAllStatuses creates new Map every time
    expect(statuses1).toBe(statuses2);
  });

  test("getAllStatuses() returns new reference only when status actually changes", () => {
    // Get initial statuses (empty)
    const statuses1 = store.getAllStatuses();
    expect(statuses1.size).toBe(0);

    // Manually set a status (simulating polling result)
    const testStatus: GitStatus = { ahead: 1, behind: 0, dirty: false };
    // @ts-expect-error - Accessing private property for testing
    store.gitStatusMap.set("test-workspace", testStatus);

    // Manually emit to notify subscribers
    // @ts-expect-error - Accessing private method for testing
    store.emit();

    // Get statuses after change
    const statuses2 = store.getAllStatuses();

    // Should be different reference (data changed)
    expect(statuses1).not.toBe(statuses2);
    expect(statuses2.size).toBe(1);
    expect(statuses2.get("test-workspace")).toEqual(testStatus);

    // Get statuses again without further changes
    const statuses3 = store.getAllStatuses();

    // Should be same as statuses2 (no changes since then)
    expect(statuses2).toBe(statuses3);
  });

  test("getStatus() returns new reference only when that workspace status changes", () => {
    // Set initial status
    const status1: GitStatus = { ahead: 0, behind: 0, dirty: false };
    // @ts-expect-error - Accessing private property for testing
    store.gitStatusMap.set("test-workspace", status1);

    // Get status
    const cached1 = store.getStatus("test-workspace");
    expect(cached1).toEqual(status1);

    // Get again without changes
    const cached2 = store.getStatus("test-workspace");

    // Should be same reference
    expect(cached1).toBe(cached2);

    // Change the status
    const status2: GitStatus = { ahead: 1, behind: 0, dirty: false };
    // @ts-expect-error - Accessing private property for testing
    store.gitStatusMap.set("test-workspace", status2);

    // Get status after change
    const cached3 = store.getStatus("test-workspace");

    // Should be different reference
    expect(cached2).not.toBe(cached3);
    expect(cached3).toEqual(status2);

    // Get again without further changes
    const cached4 = store.getStatus("test-workspace");

    // Should be same as cached3
    expect(cached3).toBe(cached4);
  });
});

