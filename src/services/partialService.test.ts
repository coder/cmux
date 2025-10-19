/* eslint-disable @typescript-eslint/unbound-method */
import { describe, test, expect, beforeEach, mock } from "bun:test";
import { PartialService } from "./partialService";
import type { HistoryService } from "./historyService";
import type { Config } from "@/config";
import type { CmuxMessage } from "@/types/message";
import { Ok } from "@/types/result";

// Mock Config
const createMockConfig = (): Config => {
  return {
    getSessionDir: mock((workspaceId: string) => `/tmp/test-sessions/${workspaceId}`),
  } as unknown as Config;
};

// Mock HistoryService
const createMockHistoryService = (): HistoryService => {
  return {
    appendToHistory: mock(() => Promise.resolve(Ok(undefined))),
    getHistory: mock(() => Promise.resolve(Ok([]))),
    updateHistory: mock(() => Promise.resolve(Ok(undefined))),
    truncateAfterMessage: mock(() => Promise.resolve(Ok(undefined))),
    clearHistory: mock(() => Promise.resolve(Ok(undefined))),
  } as unknown as HistoryService;
};

describe("PartialService - Error Recovery", () => {
  let partialService: PartialService;
  let mockConfig: Config;
  let mockHistoryService: HistoryService;

  beforeEach(() => {
    mockConfig = createMockConfig();
    mockHistoryService = createMockHistoryService();
    partialService = new PartialService(mockConfig, mockHistoryService);
  });

  test("commitToHistory should strip error metadata and commit parts from errored partial", async () => {
    const workspaceId = "test-workspace";
    const erroredPartial: CmuxMessage = {
      id: "msg-1",
      role: "assistant",
      metadata: {
        historySequence: 1,
        timestamp: Date.now(),
        model: "test-model",
        partial: true,
        error: "Stream error occurred",
        errorType: "network",
      },
      parts: [
        { type: "text", text: "Hello, I was processing when" },
        { type: "text", text: " the error occurred" },
      ],
    };

    // Mock readPartial to return errored partial
    partialService.readPartial = mock(() => Promise.resolve(erroredPartial));

    // Mock deletePartial
    partialService.deletePartial = mock(() => Promise.resolve(Ok(undefined)));

    // Mock getHistory to return no existing messages
    mockHistoryService.getHistory = mock(() => Promise.resolve(Ok([])));

    // Call commitToHistory
    const result = await partialService.commitToHistory(workspaceId);

    // Should succeed
    expect(result.success).toBe(true);

    // Should have called appendToHistory with cleaned metadata (no error/errorType)
    const appendToHistory = mockHistoryService.appendToHistory as ReturnType<typeof mock>;
    expect(appendToHistory).toHaveBeenCalledTimes(1);
    const appendedMessage = appendToHistory.mock.calls[0][1] as CmuxMessage;

    expect(appendedMessage.id).toBe("msg-1");
    expect(appendedMessage.parts).toEqual(erroredPartial.parts);
    expect(appendedMessage.metadata?.error).toBeUndefined();
    expect(appendedMessage.metadata?.errorType).toBeUndefined();
    expect(appendedMessage.metadata?.historySequence).toBe(1);

    // Should have deleted the partial after committing
    const deletePartial = partialService.deletePartial as ReturnType<typeof mock>;
    expect(deletePartial).toHaveBeenCalledWith(workspaceId);
  });

  test("commitToHistory should update existing placeholder when errored partial has more parts", async () => {
    const workspaceId = "test-workspace";
    const erroredPartial: CmuxMessage = {
      id: "msg-1",
      role: "assistant",
      metadata: {
        historySequence: 1,
        timestamp: Date.now(),
        model: "test-model",
        partial: true,
        error: "Stream error occurred",
        errorType: "network",
      },
      parts: [
        { type: "text", text: "Accumulated content before error" },
        {
          type: "dynamic-tool",
          toolCallId: "call-1",
          toolName: "bash",
          state: "input-available",
          input: { script: "echo test" },
        },
      ],
    };

    const existingPlaceholder: CmuxMessage = {
      id: "msg-1",
      role: "assistant",
      metadata: {
        historySequence: 1,
        timestamp: Date.now(),
        model: "test-model",
        partial: true,
      },
      parts: [], // Empty placeholder
    };

    // Mock readPartial to return errored partial
    partialService.readPartial = mock(() => Promise.resolve(erroredPartial));

    // Mock deletePartial
    partialService.deletePartial = mock(() => Promise.resolve(Ok(undefined)));

    // Mock getHistory to return existing placeholder
    mockHistoryService.getHistory = mock(() => Promise.resolve(Ok([existingPlaceholder])));

    // Call commitToHistory
    const result = await partialService.commitToHistory(workspaceId);

    // Should succeed
    expect(result.success).toBe(true);

    // Should have called updateHistory (not append) with cleaned metadata
    const updateHistory = mockHistoryService.updateHistory as ReturnType<typeof mock>;
    const appendToHistory = mockHistoryService.appendToHistory as ReturnType<typeof mock>;
    expect(updateHistory).toHaveBeenCalledTimes(1);
    expect(appendToHistory).not.toHaveBeenCalled();

    const updatedMessage = updateHistory.mock.calls[0][1] as CmuxMessage;

    expect(updatedMessage.parts).toEqual(erroredPartial.parts);
    expect(updatedMessage.metadata?.error).toBeUndefined();
    expect(updatedMessage.metadata?.errorType).toBeUndefined();

    // Should have deleted the partial after updating
    const deletePartial = partialService.deletePartial as ReturnType<typeof mock>;
    expect(deletePartial).toHaveBeenCalledWith(workspaceId);
  });
});
