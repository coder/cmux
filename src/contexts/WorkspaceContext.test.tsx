/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable @typescript-eslint/consistent-type-assertions */
import type { FrontendWorkspaceMetadata } from "@/types/workspace";
import type { IPCApi } from "@/types/ipc";
import type { WorkspaceSelection } from "@/components/ProjectSidebar";
import type { ProjectConfig } from "@/config";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalWindow } from "happy-dom";
import type { WorkspaceContext } from "./WorkspaceContext";
import { WorkspaceProvider, useWorkspaceContext } from "./WorkspaceContext";

// Helper to create test workspace metadata with default runtime config
const createWorkspaceMetadata = (
  overrides: Partial<FrontendWorkspaceMetadata> & Pick<FrontendWorkspaceMetadata, "id">
): FrontendWorkspaceMetadata => ({
  projectPath: "/test",
  projectName: "test",
  name: "main",
  namedWorkspacePath: "/test-main",
  createdAt: "2025-01-01T00:00:00.000Z",
  runtimeConfig: { type: "local", srcBaseDir: "/home/user/.mux/src" },
  ...overrides,
});

describe("WorkspaceContext", () => {
  afterEach(() => {
    cleanup();

    // @ts-expect-error - Resetting global state in tests
    globalThis.window = undefined;
    // @ts-expect-error - Resetting global state in tests
    globalThis.document = undefined;
    // @ts-expect-error - Resetting global state in tests
    globalThis.localStorage = undefined;
  });

  test("loads workspace metadata on mount", async () => {
    const initialWorkspaces: FrontendWorkspaceMetadata[] = [
      createWorkspaceMetadata({
        id: "ws-1",
        projectPath: "/alpha",
        projectName: "alpha",
        name: "main",
        namedWorkspacePath: "/alpha-main",
        createdAt: "2025-01-01T00:00:00.000Z",
      }),
      createWorkspaceMetadata({
        id: "ws-2",
        projectPath: "/beta",
        projectName: "beta",
        name: "dev",
        namedWorkspacePath: "/beta-dev",
        createdAt: "2025-01-02T00:00:00.000Z",
      }),
    ];

    const workspaceApi = createMockAPI({
      list: () => Promise.resolve(initialWorkspaces),
    });

    createMockProjectsAPI({
      list: () => Promise.resolve([]),
    });

    const onProjectsUpdate = mock(() => {});

    const ctx = await setup({
      onProjectsUpdate,
    });

    await waitFor(() => expect(ctx().workspaceMetadata.size).toBe(2));
    expect(workspaceApi.list).toHaveBeenCalled();
    expect(ctx().loading).toBe(false);
    expect(ctx().workspaceMetadata.has("ws-1")).toBe(true);
    expect(ctx().workspaceMetadata.has("ws-2")).toBe(true);
  });

  test("sets empty map on API error during load", async () => {
    createMockAPI({
      list: () => Promise.reject(new Error("network failure")),
    });

    createMockProjectsAPI({
      list: () => Promise.resolve([]),
    });

    const onProjectsUpdate = mock(() => {});

    const ctx = await setup({
      onProjectsUpdate,
    });

    // Should have empty workspaces after failed load
    await waitFor(() => {
      expect(ctx().workspaceMetadata.size).toBe(0);
      expect(ctx().loading).toBe(false);
    });
  });

  test("refreshWorkspaceMetadata reloads workspace data", async () => {
    const initialWorkspaces: FrontendWorkspaceMetadata[] = [
      createWorkspaceMetadata({
        id: "ws-1",
        projectPath: "/alpha",
        projectName: "alpha",
        name: "main",
        namedWorkspacePath: "/alpha-main",
        createdAt: "2025-01-01T00:00:00.000Z",
      }),
    ];

    const updatedWorkspaces: FrontendWorkspaceMetadata[] = [
      ...initialWorkspaces,
      createWorkspaceMetadata({
        id: "ws-2",
        projectPath: "/beta",
        projectName: "beta",
        name: "dev",
        namedWorkspacePath: "/beta-dev",
        createdAt: "2025-01-02T00:00:00.000Z",
      }),
    ];

    let callCount = 0;
    const workspaceApi = createMockAPI({
      list: () => {
        callCount++;
        return Promise.resolve(callCount === 1 ? initialWorkspaces : updatedWorkspaces);
      },
    });

    createMockProjectsAPI({
      list: () => Promise.resolve([]),
    });

    const onProjectsUpdate = mock(() => {});

    const ctx = await setup({
      onProjectsUpdate,
    });

    await waitFor(() => expect(ctx().workspaceMetadata.size).toBe(1));

    await act(async () => {
      await ctx().refreshWorkspaceMetadata();
    });

    expect(ctx().workspaceMetadata.size).toBe(2);
    expect(workspaceApi.list.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  test("createWorkspace creates new workspace and reloads data", async () => {
    const newWorkspace: FrontendWorkspaceMetadata = createWorkspaceMetadata({
      id: "ws-new",
      projectPath: "/gamma",
      projectName: "gamma",
      name: "feature",
      namedWorkspacePath: "/gamma-feature",
      createdAt: "2025-01-03T00:00:00.000Z",
    });

    const workspaceApi = createMockAPI({
      list: () => Promise.resolve([]),
      create: () =>
        Promise.resolve({
          success: true as const,
          metadata: newWorkspace,
        }),
    });

    const projectsApi = createMockProjectsAPI({
      list: () => Promise.resolve([]),
    });

    const onProjectsUpdate = mock(() => {});

    const ctx = await setup({
      onProjectsUpdate,
    });

    await waitFor(() => expect(ctx().loading).toBe(false));

    let result: Awaited<ReturnType<WorkspaceContext["createWorkspace"]>>;
    await act(async () => {
      result = await ctx().createWorkspace("/gamma", "feature", "main");
    });

    expect(workspaceApi.create).toHaveBeenCalledWith("/gamma", "feature", "main", undefined);
    expect(projectsApi.list).toHaveBeenCalled();
    expect(result!.workspaceId).toBe("ws-new");
    expect(result!.projectPath).toBe("/gamma");
    expect(result!.projectName).toBe("gamma");
  });

  test("createWorkspace throws on failure", async () => {
    createMockAPI({
      list: () => Promise.resolve([]),
      create: () =>
        Promise.resolve({
          success: false,
          error: "Failed to create workspace",
        }),
    });

    createMockProjectsAPI({
      list: () => Promise.resolve([]),
    });

    const onProjectsUpdate = mock(() => {});

    const ctx = await setup({
      onProjectsUpdate,
    });

    await waitFor(() => expect(ctx().loading).toBe(false));

    expect(async () => {
      await act(async () => {
        await ctx().createWorkspace("/gamma", "feature", "main");
      });
    }).toThrow("Failed to create workspace");
  });

  test("removeWorkspace removes workspace and clears selection if active", async () => {
    const workspace: FrontendWorkspaceMetadata = createWorkspaceMetadata({
      id: "ws-1",
      projectPath: "/alpha",
      projectName: "alpha",
      name: "main",
      namedWorkspacePath: "/alpha-main",
      createdAt: "2025-01-01T00:00:00.000Z",
    });

    const workspaceApi = createMockAPI({
      list: () => Promise.resolve([workspace]),
      remove: () => Promise.resolve({ success: true as const }),
    });

    createMockProjectsAPI({
      list: () => Promise.resolve([]),
    });

    const onProjectsUpdate = mock(() => {});

    const ctx = await setup({
      onProjectsUpdate,
    });

    await waitFor(() => expect(ctx().loading).toBe(false));

    // Set the selected workspace via context API
    act(() => {
      ctx().setSelectedWorkspace({
        workspaceId: "ws-1",
        projectPath: "/alpha",
        projectName: "alpha",
        namedWorkspacePath: "/alpha-main",
      });
    });

    expect(ctx().selectedWorkspace?.workspaceId).toBe("ws-1");

    let result: Awaited<ReturnType<WorkspaceContext["removeWorkspace"]>>;
    await act(async () => {
      result = await ctx().removeWorkspace("ws-1");
    });

    expect(workspaceApi.remove).toHaveBeenCalledWith("ws-1", undefined);
    expect(result!.success).toBe(true);
    // Verify selectedWorkspace was cleared
    expect(ctx().selectedWorkspace).toBeNull();
  });

  test("removeWorkspace handles failure gracefully", async () => {
    const workspace: FrontendWorkspaceMetadata = createWorkspaceMetadata({
      id: "ws-1",
      projectPath: "/alpha",
      projectName: "alpha",
      name: "main",
      namedWorkspacePath: "/alpha-main",
      createdAt: "2025-01-01T00:00:00.000Z",
    });

    const workspaceApi = createMockAPI({
      list: () => Promise.resolve([workspace]),
      remove: () => Promise.resolve({ success: false, error: "Permission denied" }),
    });

    createMockProjectsAPI({
      list: () => Promise.resolve([]),
    });

    const onProjectsUpdate = mock(() => {});

    const ctx = await setup({
      onProjectsUpdate,
    });

    await waitFor(() => expect(ctx().loading).toBe(false));

    let result: Awaited<ReturnType<WorkspaceContext["removeWorkspace"]>>;
    await act(async () => {
      result = await ctx().removeWorkspace("ws-1");
    });

    expect(workspaceApi.remove).toHaveBeenCalledWith("ws-1", undefined);
    expect(result!.success).toBe(false);
    expect(result!.error).toBe("Permission denied");
  });

  test("renameWorkspace renames workspace and updates selection if active", async () => {
    const oldWorkspace: FrontendWorkspaceMetadata = createWorkspaceMetadata({
      id: "ws-1",
      projectPath: "/alpha",
      projectName: "alpha",
      name: "main",
      namedWorkspacePath: "/alpha-main",
      createdAt: "2025-01-01T00:00:00.000Z",
    });

    const newWorkspace: FrontendWorkspaceMetadata = createWorkspaceMetadata({
      id: "ws-2",
      projectPath: "/alpha",
      projectName: "alpha",
      name: "renamed",
      namedWorkspacePath: "/alpha-renamed",
      createdAt: "2025-01-01T00:00:00.000Z",
    });

    const workspaceApi = createMockAPI({
      list: () => Promise.resolve([oldWorkspace]),
      rename: () =>
        Promise.resolve({
          success: true as const,
          data: { newWorkspaceId: "ws-2" },
        }),
      getInfo: (workspaceId: string) => {
        if (workspaceId === "ws-2") {
          return Promise.resolve(newWorkspace);
        }
        return Promise.resolve(null);
      },
    });

    createMockProjectsAPI({
      list: () => Promise.resolve([]),
    });

    const onProjectsUpdate = mock(() => {});

    const ctx = await setup({
      onProjectsUpdate,
    });

    await waitFor(() => expect(ctx().loading).toBe(false));

    // Set the selected workspace via context API
    act(() => {
      ctx().setSelectedWorkspace({
        workspaceId: "ws-1",
        projectPath: "/alpha",
        projectName: "alpha",
        namedWorkspacePath: "/alpha-main",
      });
    });

    expect(ctx().selectedWorkspace?.workspaceId).toBe("ws-1");

    let result: Awaited<ReturnType<WorkspaceContext["renameWorkspace"]>>;
    await act(async () => {
      result = await ctx().renameWorkspace("ws-1", "renamed");
    });

    expect(workspaceApi.rename).toHaveBeenCalledWith("ws-1", "renamed");
    expect(result!.success).toBe(true);
    expect(workspaceApi.getInfo).toHaveBeenCalledWith("ws-2");
    // Verify selectedWorkspace was updated with new ID
    expect(ctx().selectedWorkspace).toEqual({
      workspaceId: "ws-2",
      projectPath: "/alpha",
      projectName: "alpha",
      namedWorkspacePath: "/alpha-renamed",
    });
  });

  test("renameWorkspace handles failure gracefully", async () => {
    const workspace: FrontendWorkspaceMetadata = createWorkspaceMetadata({
      id: "ws-1",
      projectPath: "/alpha",
      projectName: "alpha",
      name: "main",
      namedWorkspacePath: "/alpha-main",
      createdAt: "2025-01-01T00:00:00.000Z",
    });

    const workspaceApi = createMockAPI({
      list: () => Promise.resolve([workspace]),
      rename: () => Promise.resolve({ success: false, error: "Name already exists" }),
    });

    createMockProjectsAPI({
      list: () => Promise.resolve([]),
    });

    const onProjectsUpdate = mock(() => {});

    const ctx = await setup({
      onProjectsUpdate,
    });

    await waitFor(() => expect(ctx().loading).toBe(false));

    let result: Awaited<ReturnType<WorkspaceContext["renameWorkspace"]>>;
    await act(async () => {
      result = await ctx().renameWorkspace("ws-1", "renamed");
    });

    expect(workspaceApi.rename).toHaveBeenCalledWith("ws-1", "renamed");
    expect(result!.success).toBe(false);
    expect(result!.error).toBe("Name already exists");
  });

  test("getWorkspaceInfo fetches workspace metadata", async () => {
    const workspace: FrontendWorkspaceMetadata = createWorkspaceMetadata({
      id: "ws-1",
      projectPath: "/alpha",
      projectName: "alpha",
      name: "main",
      namedWorkspacePath: "/alpha-main",
      createdAt: "2025-01-01T00:00:00.000Z",
    });

    const workspaceApi = createMockAPI({
      list: () => Promise.resolve([]),
      getInfo: (workspaceId: string) => {
        if (workspaceId === "ws-1") {
          return Promise.resolve(workspace);
        }
        return Promise.resolve(null);
      },
    });

    createMockProjectsAPI({
      list: () => Promise.resolve([]),
    });

    const onProjectsUpdate = mock(() => {});

    const ctx = await setup({
      onProjectsUpdate,
    });

    await waitFor(() => expect(ctx().loading).toBe(false));

    const info = await ctx().getWorkspaceInfo("ws-1");
    expect(workspaceApi.getInfo).toHaveBeenCalledWith("ws-1");
    expect(info).toEqual(workspace);
  });

  test("tracks pending workspace creation state", async () => {
    createMockAPI({
      list: () => Promise.resolve([]),
    });

    createMockProjectsAPI({
      list: () => Promise.resolve([]),
    });

    const onProjectsUpdate = mock(() => {});

    const ctx = await setup({
      onProjectsUpdate,
    });

    await waitFor(() => expect(ctx().loading).toBe(false));

    expect(ctx().pendingNewWorkspaceProject).toBeNull();

    act(() => {
      ctx().beginWorkspaceCreation("/alpha");
    });
    expect(ctx().pendingNewWorkspaceProject).toBe("/alpha");

    act(() => {
      ctx().clearPendingWorkspaceCreation();
    });
    expect(ctx().pendingNewWorkspaceProject).toBeNull();
  });

  test("reacts to metadata update events (new workspace)", async () => {
    let metadataListener:
      | ((event: { workspaceId: string; metadata: FrontendWorkspaceMetadata | null }) => void)
      | null = null;

    createMockAPI({
      list: () => Promise.resolve([]),
      onMetadata: (listener: any) => {
        metadataListener = listener;
        return () => {
          metadataListener = null;
        };
      },
    });

    const projectsApi = createMockProjectsAPI({
      list: () => Promise.resolve([]),
    });

    const onProjectsUpdate = mock(() => {});

    const ctx = await setup({
      onProjectsUpdate,
    });

    await waitFor(() => expect(ctx().loading).toBe(false));

    const newWorkspace: FrontendWorkspaceMetadata = createWorkspaceMetadata({
      id: "ws-new",
      projectPath: "/gamma",
      projectName: "gamma",
      name: "feature",
      namedWorkspacePath: "/gamma-feature",
      createdAt: "2025-01-03T00:00:00.000Z",
    });

    await act(async () => {
      metadataListener!({ workspaceId: "ws-new", metadata: newWorkspace });
      // Give async side effects time to run
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(ctx().workspaceMetadata.has("ws-new")).toBe(true);
    // Should reload projects when new workspace is created
    expect(projectsApi.list.mock.calls.length).toBeGreaterThan(1);
  });

  test("reacts to metadata update events (delete workspace)", async () => {
    const workspace: FrontendWorkspaceMetadata = createWorkspaceMetadata({
      id: "ws-1",
      projectPath: "/alpha",
      projectName: "alpha",
      name: "main",
      namedWorkspacePath: "/alpha-main",
      createdAt: "2025-01-01T00:00:00.000Z",
    });

    let metadataListener:
      | ((event: { workspaceId: string; metadata: FrontendWorkspaceMetadata | null }) => void)
      | null = null;

    createMockAPI({
      list: () => Promise.resolve([workspace]),
      onMetadata: (listener: any) => {
        metadataListener = listener;
        return () => {
          metadataListener = null;
        };
      },
    });

    createMockProjectsAPI({
      list: () => Promise.resolve([]),
    });

    const onProjectsUpdate = mock(() => {});

    const ctx = await setup({
      onProjectsUpdate,
    });

    await waitFor(() => expect(ctx().workspaceMetadata.has("ws-1")).toBe(true));

    act(() => {
      metadataListener!({ workspaceId: "ws-1", metadata: null });
    });

    expect(ctx().workspaceMetadata.has("ws-1")).toBe(false);
  });

  test("ensureCreatedAt adds default timestamp when missing", async () => {
    const workspaceWithoutTimestamp = {
      id: "ws-1",
      projectPath: "/alpha",
      projectName: "alpha",
      name: "main",
      namedWorkspacePath: "/alpha-main",
    } as FrontendWorkspaceMetadata;

    createMockAPI({
      list: () => Promise.resolve([workspaceWithoutTimestamp]),
    });

    createMockProjectsAPI({
      list: () => Promise.resolve([]),
    });

    const onProjectsUpdate = mock(() => {});

    const ctx = await setup({
      onProjectsUpdate,
    });

    await waitFor(() => expect(ctx().workspaceMetadata.size).toBe(1));

    const metadata = ctx().workspaceMetadata.get("ws-1");
    expect(metadata?.createdAt).toBe("2025-01-01T00:00:00.000Z");
  });
});

async function setup(props: {
  onProjectsUpdate: (projects: Map<string, ProjectConfig>) => void;
}) {
  const contextRef = { current: null as WorkspaceContext | null };
  function ContextCapture() {
    contextRef.current = useWorkspaceContext();
    return null;
  }
  render(
    <WorkspaceProvider onProjectsUpdate={props.onProjectsUpdate}>
      <ContextCapture />
    </WorkspaceProvider>
  );
  await waitFor(() => expect(contextRef.current).toBeTruthy());
  return () => contextRef.current!;
}

function createMockAPI(overrides: Partial<IPCApi["workspace"]>) {
  const workspace = {
    create: mock(
      overrides.create ??
        (() =>
          Promise.resolve({
            success: true as const,
            metadata: createWorkspaceMetadata({ id: "ws-1" }),
          }))
    ),
    list: mock(overrides.list ?? (() => Promise.resolve([]))),
    remove: mock(
      overrides.remove ?? (() => Promise.resolve({ success: true as const, data: undefined }))
    ),
    rename: mock(
      overrides.rename ??
        (() =>
          Promise.resolve({
            success: true as const,
            data: { newWorkspaceId: "ws-1" },
          }))
    ),
    getInfo: mock(overrides.getInfo ?? (() => Promise.resolve(null))),
    onMetadata: mock(
      overrides.onMetadata ??
        (() => {
          return () => {};
        })
    ),
  } as any;

  globalThis.window = new GlobalWindow() as any;
  globalThis.window.api = {
    workspace,
  } as any;
  globalThis.document = globalThis.window.document;
  globalThis.localStorage = globalThis.window.localStorage;

  return workspace;
}

function createMockProjectsAPI(overrides: Partial<IPCApi["projects"]>) {
  const projects = {
    list: mock(overrides.list ?? (() => Promise.resolve([]))),
  } as any;

  if (!globalThis.window) {
    globalThis.window = new GlobalWindow() as any;
    globalThis.document = globalThis.window.document;
  }

  if (!globalThis.window.api) {
    globalThis.window.api = {} as any;
  }

  globalThis.window.api.projects = projects;

  return projects;
}
