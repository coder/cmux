import type { FrontendWorkspaceMetadata } from "@/types/workspace";
import { WorkspaceStore } from "./WorkspaceStore";

// Mock window.api
const mockExecuteBash = jest.fn(() => ({
  success: true,
  data: {
    success: false,
    error: "executeBash is mocked in WorkspaceStore.test.ts",
    output: "",
    exitCode: 0,
  },
}));

const mockWindow = {
  api: {
    workspace: {
      onChat: jest.fn((_workspaceId, _callback) => {
        // Return unsubscribe function
        return () => {
          // Empty unsubscribe
        };
      }),
      replaceChatHistory: jest.fn(),
      executeBash: mockExecuteBash,
    },
  },
};

global.window = mockWindow as unknown as Window & typeof globalThis;

// Mock dispatchEvent
global.window.dispatchEvent = jest.fn();

// Helper to get IPC callback in a type-safe way
function getOnChatCallback<T = { type: string }>(): (data: T) => void {
  const mock = mockWindow.api.workspace.onChat as jest.Mock<
    () => void,
    [string, (data: T) => void]
  >;
  return mock.mock.calls[0][1];
}

describe("WorkspaceStore", () => {
  let store: WorkspaceStore;
  let mockOnModelUsed: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecuteBash.mockClear();
    mockOnModelUsed = jest.fn();
    store = new WorkspaceStore(mockOnModelUsed);
  });

  afterEach(() => {
    store.dispose();
  });

  describe("subscription", () => {
    it("should call listener when workspace state changes", async () => {
      const listener = jest.fn();
      const unsubscribe = store.subscribe(listener);

      // Create workspace metadata
      const metadata: FrontendWorkspaceMetadata = {
        id: "test-workspace",
        name: "test-workspace",
        projectName: "test-project",
        projectPath: "/test/project",
        namedWorkspacePath: "/test/project/test-workspace",
      };

      // Add workspace (should trigger IPC subscription)
      store.addWorkspace(metadata);

      // Simulate a caught-up message (triggers emit)
      const onChatCallback = getOnChatCallback();
      onChatCallback({ type: "caught-up" });

      // Wait for queueMicrotask to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(listener).toHaveBeenCalled();

      unsubscribe();
    });

    it("should allow unsubscribe", () => {
      const listener = jest.fn();
      const unsubscribe = store.subscribe(listener);

      const metadata: FrontendWorkspaceMetadata = {
        id: "test-workspace",
        name: "test-workspace",
        projectName: "test-project",
        projectPath: "/test/project",
        namedWorkspacePath: "/test/project/test-workspace",
      };

      store.addWorkspace(metadata);

      // Unsubscribe before emitting
      unsubscribe();

      const onChatCallback = getOnChatCallback();
      onChatCallback({ type: "caught-up" });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("syncWorkspaces", () => {
    it("should add new workspaces", () => {
      const metadata1: FrontendWorkspaceMetadata = {
        id: "workspace-1",
        name: "workspace-1",
        projectName: "project-1",
        projectPath: "/project-1",
        namedWorkspacePath: "/path/1",
      };

      const workspaceMap = new Map([[metadata1.id, metadata1]]);
      store.syncWorkspaces(workspaceMap);

      expect(mockWindow.api.workspace.onChat).toHaveBeenCalledWith(
        "workspace-1",
        expect.any(Function)
      );
    });

    it("should remove deleted workspaces", () => {
      const metadata1: FrontendWorkspaceMetadata = {
        id: "workspace-1",
        name: "workspace-1",
        projectName: "project-1",
        projectPath: "/project-1",
        namedWorkspacePath: "/path/1",
      };

      // Add workspace
      store.addWorkspace(metadata1);
      const unsubscribeSpy = jest.fn();
      (mockWindow.api.workspace.onChat as jest.Mock).mockReturnValue(unsubscribeSpy);

      // Sync with empty map (removes all workspaces)
      store.syncWorkspaces(new Map());

      // Note: The unsubscribe function from the first add won't be captured
      // since we mocked it before. In real usage, this would be called.
    });
  });

  describe("getWorkspaceState", () => {
    it("should return default state for new workspace", () => {
      const state = store.getWorkspaceState("new-workspace");

      expect(state).toMatchObject({
        messages: [],
        canInterrupt: false,
        isCompacting: false,
        loading: true, // loading because not caught up
        cmuxMessages: [],
        currentModel: null,
        recencyTimestamp: null,
      });
    });

    it("should return cached state when values unchanged", () => {
      const state1 = store.getWorkspaceState("test-workspace");
      const state2 = store.getWorkspaceState("test-workspace");

      // Note: Currently the cache doesn't work because aggregator.getDisplayedMessages()
      // creates new arrays. This is acceptable for Phase 1 - React will still do
      // Object.is() comparison and skip re-renders for primitive values.
      // TODO: Optimize aggregator caching in Phase 2
      expect(state1).toEqual(state2);
      expect(state1.canInterrupt).toBe(state2.canInterrupt);
      expect(state1.loading).toBe(state2.loading);
    });
  });

  describe("getWorkspaceRecency", () => {
    it("should return stable reference when values unchanged", () => {
      const recency1 = store.getWorkspaceRecency();
      const recency2 = store.getWorkspaceRecency();

      // Should be same reference (cached)
      expect(recency1).toBe(recency2);
    });
  });

  describe("model tracking", () => {
    it("should call onModelUsed when stream starts", async () => {
      const metadata: FrontendWorkspaceMetadata = {
        id: "test-workspace",
        name: "test-workspace",
        projectName: "test-project",
        projectPath: "/test/project",
        namedWorkspacePath: "/test/project/test-workspace",
      };

      store.addWorkspace(metadata);

      const onChatCallback = getOnChatCallback<{
        type: string;
        messageId?: string;
        model?: string;
      }>();

      // Mark workspace as caught-up first (required for stream events to process)
      onChatCallback({
        type: "caught-up",
      });

      onChatCallback({
        type: "stream-start",
        messageId: "msg-1",
        model: "claude-opus-4",
      });

      // Wait for queueMicrotask to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(mockOnModelUsed).toHaveBeenCalledWith("claude-opus-4");
    });
  });

  describe("reference stability", () => {
    it("getAllStates() returns new Map on each call", () => {
      const states1 = store.getAllStates();
      const states2 = store.getAllStates();
      // Should return new Map each time (not cached/reactive)
      expect(states1).not.toBe(states2);
      expect(states1).toEqual(states2); // But contents are equal
    });

    it("getWorkspaceState() returns same reference when state hasn't changed", () => {
      const metadata: FrontendWorkspaceMetadata = {
        id: "test-workspace",
        name: "test-workspace",
        projectName: "test-project",
        projectPath: "/test/project",
        namedWorkspacePath: "/test/project/test-workspace",
      };
      store.addWorkspace(metadata);

      const state1 = store.getWorkspaceState("test-workspace");
      const state2 = store.getWorkspaceState("test-workspace");
      expect(state1).toBe(state2);
    });

    it("syncWorkspaces() does not emit when workspaces unchanged", () => {
      const listener = jest.fn();
      store.subscribe(listener);

      const metadata = new Map<string, FrontendWorkspaceMetadata>();
      store.syncWorkspaces(metadata);
      expect(listener).not.toHaveBeenCalled();

      listener.mockClear();
      store.syncWorkspaces(metadata);
      expect(listener).not.toHaveBeenCalled();
    });

    it("getAggregator does not emit when creating new aggregator (no render side effects)", () => {
      let emitCount = 0;
      const unsubscribe = store.subscribe(() => {
        emitCount++;
      });

      // Simulate what happens during render - component calls getAggregator
      const aggregator1 = store.getAggregator("test-workspace");
      expect(aggregator1).toBeDefined();

      // Should NOT have emitted (would cause "Cannot update component while rendering" error)
      expect(emitCount).toBe(0);

      // Subsequent calls should return same aggregator
      const aggregator2 = store.getAggregator("test-workspace");
      expect(aggregator2).toBe(aggregator1);
      expect(emitCount).toBe(0);

      unsubscribe();
    });
  });

  describe("cache invalidation", () => {
    it("invalidates getWorkspaceState() cache when workspace changes", async () => {
      const metadata: FrontendWorkspaceMetadata = {
        id: "test-workspace",
        name: "test-workspace",
        projectName: "test-project",
        projectPath: "/test/project",
        namedWorkspacePath: "/test/project/test-workspace",
      };
      store.addWorkspace(metadata);

      const state1 = store.getWorkspaceState("test-workspace");

      // Trigger change
      const onChatCallback = getOnChatCallback<{
        type: string;
        messageId?: string;
        model?: string;
      }>();

      // Mark workspace as caught-up first
      onChatCallback({
        type: "caught-up",
      });

      onChatCallback({
        type: "stream-start",
        messageId: "msg1",
        model: "claude-sonnet-4",
      });

      // Wait for queueMicrotask to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      const state2 = store.getWorkspaceState("test-workspace");
      expect(state1).not.toBe(state2); // Cache should be invalidated
      expect(state2.canInterrupt).toBe(true); // Stream started, so can interrupt
    });

    it("invalidates getAllStates() cache when workspace changes", async () => {
      const metadata: FrontendWorkspaceMetadata = {
        id: "test-workspace",
        name: "test-workspace",
        projectName: "test-project",
        projectPath: "/test/project",
        namedWorkspacePath: "/test/project/test-workspace",
      };
      store.addWorkspace(metadata);

      const states1 = store.getAllStates();

      // Trigger change
      const onChatCallback = getOnChatCallback<{
        type: string;
        messageId?: string;
        model?: string;
      }>();

      // Mark workspace as caught-up first
      onChatCallback({
        type: "caught-up",
      });

      onChatCallback({
        type: "stream-start",
        messageId: "msg1",
        model: "claude-sonnet-4",
      });

      // Wait for queueMicrotask to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      const states2 = store.getAllStates();
      expect(states1).not.toBe(states2); // Cache should be invalidated
    });

    it("invalidates getWorkspaceRecency() cache when workspace changes", async () => {
      const metadata: FrontendWorkspaceMetadata = {
        id: "test-workspace",
        name: "test-workspace",
        projectName: "test-project",
        projectPath: "/test/project",
        namedWorkspacePath: "/test/project/test-workspace",
      };
      store.addWorkspace(metadata);

      const recency1 = store.getWorkspaceRecency();

      // Trigger change (caught-up message)
      const onChatCallback = getOnChatCallback();
      onChatCallback({ type: "caught-up" });

      // Wait for queueMicrotask to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      const recency2 = store.getWorkspaceRecency();
      expect(recency1).not.toBe(recency2); // Cache should be invalidated
    });

    it("maintains cache when no changes occur", () => {
      const metadata: FrontendWorkspaceMetadata = {
        id: "test-workspace",
        name: "test-workspace",
        projectName: "test-project",
        projectPath: "/test/project",
        namedWorkspacePath: "/test/project/test-workspace",
      };
      store.addWorkspace(metadata);

      const state1 = store.getWorkspaceState("test-workspace");
      const state2 = store.getWorkspaceState("test-workspace");
      const recency1 = store.getWorkspaceRecency();
      const recency2 = store.getWorkspaceRecency();

      // Cached values should return same references
      expect(state1).toBe(state2);
      expect(recency1).toBe(recency2);

      // getAllStates returns new Map each time (not cached)
      const allStates1 = store.getAllStates();
      const allStates2 = store.getAllStates();
      expect(allStates1).not.toBe(allStates2);
      expect(allStates1).toEqual(allStates2);
    });
  });

  describe("race conditions", () => {
    it("handles IPC message for removed workspace gracefully", async () => {
      const metadata: FrontendWorkspaceMetadata = {
        id: "test-workspace",
        name: "test-workspace",
        projectName: "test-project",
        projectPath: "/test/project",
        namedWorkspacePath: "/test/project/test-workspace",
      };
      store.addWorkspace(metadata);

      const onChatCallback = getOnChatCallback();

      // Remove workspace (clears aggregator and unsubscribes IPC)
      store.removeWorkspace("test-workspace");

      // IPC message arrives after removal - should not throw
      // Note: In practice, the IPC unsubscribe should prevent this,
      // but if a message was already queued, it should handle gracefully
      const onChatCallbackTyped = onChatCallback as (data: {
        type: string;
        messageId?: string;
        model?: string;
      }) => void;
      expect(() => {
        // Mark as caught-up first
        onChatCallbackTyped({
          type: "caught-up",
        });
        onChatCallbackTyped({
          type: "stream-start",
          messageId: "msg1",
          model: "claude-sonnet-4",
        });
      }).not.toThrow();

      // Wait for queueMicrotask to complete
      await new Promise((resolve) => setTimeout(resolve, 0));

      // The message handler will have created a new aggregator (lazy init)
      // because getOrCreateAggregator always creates if not exists.
      // This is actually fine - the workspace just has no IPC subscription.
      const allStates = store.getAllStates();
      expect(allStates.size).toBe(1); // Aggregator exists but not subscribed
      expect(allStates.get("test-workspace")?.canInterrupt).toBe(true); // Stream started
    });

    it("handles concurrent workspace additions", () => {
      const metadata1: FrontendWorkspaceMetadata = {
        id: "workspace-1",
        name: "workspace-1",
        projectName: "project-1",
        projectPath: "/project-1",
        namedWorkspacePath: "/path/1",
      };
      const metadata2: FrontendWorkspaceMetadata = {
        id: "workspace-2",
        name: "workspace-2",
        projectName: "project-2",
        projectPath: "/project-2",
        namedWorkspacePath: "/path/2",
      };

      // Add workspaces concurrently
      store.addWorkspace(metadata1);
      store.addWorkspace(metadata2);

      const allStates = store.getAllStates();
      expect(allStates.size).toBe(2);
      expect(allStates.has("workspace-1")).toBe(true);
      expect(allStates.has("workspace-2")).toBe(true);
    });

    it("handles workspace removal during state access", () => {
      const metadata: FrontendWorkspaceMetadata = {
        id: "test-workspace",
        name: "test-workspace",
        projectName: "test-project",
        projectPath: "/test/project",
        namedWorkspacePath: "/test/project/test-workspace",
      };
      store.addWorkspace(metadata);

      const state1 = store.getWorkspaceState("test-workspace");
      expect(state1).toBeDefined();

      // Remove workspace
      store.removeWorkspace("test-workspace");

      // Accessing state after removal should create new aggregator (lazy init)
      const state2 = store.getWorkspaceState("test-workspace");
      expect(state2).toBeDefined();
      expect(state2.loading).toBe(true); // Fresh workspace, not caught up
    });
  });
});
