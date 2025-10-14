/**
 * Test to reproduce: "Cannot update a component while rendering a different component"
 * This happens when getAggregator is called during render and triggers changes.
 */

import { WorkspaceStore } from "./WorkspaceStore";

describe("WorkspaceStore - Render-time side effects", () => {
  let store: WorkspaceStore;
  let emitCount: number;

  beforeEach(() => {
    store = new WorkspaceStore(jest.fn());
    emitCount = 0;
    
    // Track emits
    store.subscribe(() => {
      emitCount++;
    });
  });

  afterEach(() => {
    store.dispose();
  });

  test("getAggregator does NOT emit when creating new aggregator", () => {
    // Simulate what happens during render:
    // Component calls useWorkspaceAggregator, which calls getAggregator
    
    const aggregator1 = store.getAggregator("test-workspace");
    expect(aggregator1).toBeDefined();
    
    // Creating aggregator should NOT emit
    // (emit should only happen on explicit events, not during render)
    expect(emitCount).toBe(0);
    
    // Calling again should return same aggregator
    const aggregator2 = store.getAggregator("test-workspace");
    expect(aggregator1).toBe(aggregator2);
    
    // Still no emit
    expect(emitCount).toBe(0);
  });

  test("getWorkspaceState does NOT emit when called", () => {
    // Create aggregator first
    store.getAggregator("test-workspace");
    emitCount = 0; // Reset
    
    // Now call getWorkspaceState (simulating useWorkspaceState hook)
    const state1 = store.getWorkspaceState("test-workspace");
    expect(state1).toBeDefined();
    
    // Should NOT emit
    expect(emitCount).toBe(0);
    
    // Call again
    const state2 = store.getWorkspaceState("test-workspace");
    
    // Should return same reference AND not emit
    expect(state1).toBe(state2);
    expect(emitCount).toBe(0);
  });

  test("getAllStates does NOT emit when called", () => {
    // Create some aggregators
    store.getAggregator("ws1");
    store.getAggregator("ws2");
    emitCount = 0; // Reset
    
    // Call getAllStates (simulating useAllWorkspaceStates hook)
    const states1 = store.getAllStates();
    expect(states1.size).toBe(2);
    
    // Should NOT emit
    expect(emitCount).toBe(0);
    
    // Call again
    const states2 = store.getAllStates();
    
    // Should return same reference AND not emit
    expect(states1).toBe(states2);
    expect(emitCount).toBe(0);
  });
});

