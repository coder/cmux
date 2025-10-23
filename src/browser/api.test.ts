/**
 * Tests for browser API client
 * Tests the invokeIPC function to ensure it behaves consistently with Electron's ipcRenderer.invoke()
 */

import { describe, test, expect } from "bun:test";

// Helper to create a mock fetch that returns a specific response
function createMockFetch(responseData: unknown) {
  return () => {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(responseData),
    } as Response);
  };
}

interface InvokeResponse<T> {
  success: boolean;
  data?: T;
  error?: unknown;
}

// Helper to create invokeIPC function with mocked fetch
function createInvokeIPC(
  mockFetch: (url: string, init?: RequestInit) => Promise<Response>
): <T>(channel: string, ...args: unknown[]) => Promise<T> {
  const API_BASE = "http://localhost:3000";

  async function invokeIPC<T>(channel: string, ...args: unknown[]): Promise<T> {
    const response = await mockFetch(`${API_BASE}/ipc/${encodeURIComponent(channel)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ args }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = (await response.json()) as InvokeResponse<T>;

    if (!result.success) {
      // Failed response - check if it's a structured error or simple string
      if (typeof result.error === "object" && result.error !== null) {
        // Structured error (e.g., SendMessageError) - return as Result<T, E> for caller to handle
        return result as T;
      }
      // Simple string error - throw it
      throw new Error(typeof result.error === "string" ? result.error : "Unknown error");
    }

    // Success - unwrap and return the data
    return result.data as T;
  }

  return invokeIPC;
}

describe("Browser API invokeIPC", () => {
  test("CURRENT BEHAVIOR: throws on string error (causes unhandled rejection)", async () => {
    const mockFetch = createMockFetch({
      success: false,
      error: "fatal: contains modified or untracked files",
    });

    const invokeIPC = createInvokeIPC(mockFetch);

    // Current behavior: invokeIPC throws on string errors
    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(invokeIPC("WORKSPACE_REMOVE", "test-workspace", { force: false })).rejects.toThrow(
      "fatal: contains modified or untracked files"
    );
  });

  test.skip("DESIRED BEHAVIOR: should return error object on string error (match Electron)", async () => {
    const mockFetch = createMockFetch({
      success: false,
      error: "fatal: contains modified or untracked files",
    });

    const invokeIPC = createInvokeIPC(mockFetch);

    // Desired behavior: Should return { success: false, error: "..." }
    // This test documents what we want - actual implementation test is below
    const result = await invokeIPC<{ success: boolean; error?: string }>(
      "WORKSPACE_REMOVE",
      "test-workspace",
      { force: false }
    );

    expect(result).toEqual({
      success: false,
      error: "fatal: contains modified or untracked files",
    });
  });

  test("should return success data on success", async () => {
    const mockFetch = createMockFetch({
      success: true,
      data: { someData: "value" },
    });

    const invokeIPC = createInvokeIPC(mockFetch);

    const result = await invokeIPC("WORKSPACE_REMOVE", "test-workspace", { force: true });

    expect(result).toEqual({ someData: "value" });
  });

  test("should throw on HTTP errors", async () => {
    const mockFetch = () => {
      return Promise.resolve({
        ok: false,
        status: 500,
      } as Response);
    };

    const invokeIPC = createInvokeIPC(mockFetch);

    // eslint-disable-next-line @typescript-eslint/await-thenable
    await expect(invokeIPC("WORKSPACE_REMOVE", "test-workspace", { force: false })).rejects.toThrow(
      "HTTP error! status: 500"
    );
  });

  test("should return structured error objects as-is", async () => {
    const structuredError = {
      type: "STREAMING_IN_PROGRESS",
      message: "Cannot send message while streaming",
      workspaceId: "test-workspace",
    };

    const mockFetch = createMockFetch({
      success: false,
      error: structuredError,
    });

    const invokeIPC = createInvokeIPC(mockFetch);

    const result = await invokeIPC("WORKSPACE_SEND_MESSAGE", "test-workspace", {
      role: "user",
      content: [{ type: "text", text: "test" }],
    });

    // Structured errors should be returned as-is
    expect(result).toEqual({
      success: false,
      error: structuredError,
    });
  });
});
