import type { ScenarioTurn } from "../scenarioTypes";
import { STREAM_BASE_DELAY } from "../scenarioTypes";

export const TOOL_FLOW_PROMPTS = {
  FILE_READ: "What's in README.md?",
  LIST_DIRECTORY: "What files are in the current directory?",
  CREATE_TEST_FILE: "Create a file called test.txt with 'hello' in it",
  READ_TEST_FILE: "Now read that file",
  RECALL_TEST_FILE: "What did it contain?",
  REASONING_QUICKSORT: "Explain quicksort algorithm step by step",
} as const;

const fileReadTurn: ScenarioTurn = {
  user: {
    text: TOOL_FLOW_PROMPTS.FILE_READ,
    thinkingLevel: "medium",
    mode: "exec",
  },
  assistant: {
    messageId: "msg-tool-file-read",
    events: [
      { kind: "stream-start", delay: 0, messageId: "msg-tool-file-read", model: "mock:executor" },
      {
        kind: "tool-start",
        delay: STREAM_BASE_DELAY,
        toolCallId: "tool-file-read-1",
        toolName: "file_read",
        args: { filePath: "README.md" },
      },
      {
        kind: "tool-end",
        delay: STREAM_BASE_DELAY * 2,
        toolCallId: "tool-file-read-1",
        toolName: "file_read",
        result: {
          success: true,
          file_size: 64,
          modifiedTime: "2024-01-01T00:00:00.000Z",
          lines_read: 1,
          content: "1\tMock README content for tool flow test.",
          lease: "lease-readme-v1",
        },
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY * 2 + 100,
        text: "Here's what README.md contains:\n",
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY * 2 + 200,
        text: "1\tMock README content for tool flow test.",
      },
      {
        kind: "stream-end",
        delay: STREAM_BASE_DELAY * 3,
        metadata: {
          model: "mock:executor",
          inputTokens: 92,
          outputTokens: 64,
          systemMessageTokens: 18,
        },
        parts: [
          { type: "text", text: "Here's what README.md contains:\n" },
          { type: "text", text: "1\tMock README content for tool flow test." },
        ],
      },
    ],
  },
};

const listDirectoryTurn: ScenarioTurn = {
  user: {
    text: TOOL_FLOW_PROMPTS.LIST_DIRECTORY,
    thinkingLevel: "low",
    mode: "exec",
  },
  assistant: {
    messageId: "msg-tool-bash-ls",
    events: [
      { kind: "stream-start", delay: 0, messageId: "msg-tool-bash-ls", model: "mock:executor" },
      {
        kind: "tool-start",
        delay: STREAM_BASE_DELAY,
        toolCallId: "tool-bash-ls",
        toolName: "bash",
        args: { script: "ls -1", timeout_secs: 10 },
      },
      {
        kind: "tool-end",
        delay: STREAM_BASE_DELAY * 2,
        toolCallId: "tool-bash-ls",
        toolName: "bash",
        result: {
          success: true,
          output: "README.md\npackage.json\nsrc\n",
          exitCode: 0,
          wall_duration_ms: 120,
        },
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY * 2 + 100,
        text: "Directory listing:\n",
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY * 2 + 200,
        text: "- README.md\n",
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY * 2 + 300,
        text: "- package.json\n",
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY * 2 + 400,
        text: "- src",
      },
      {
        kind: "stream-end",
        delay: STREAM_BASE_DELAY * 3,
        metadata: {
          model: "mock:executor",
          inputTokens: 74,
          outputTokens: 58,
          systemMessageTokens: 16,
        },
        parts: [
          { type: "text", text: "Directory listing:\n" },
          { type: "text", text: "- README.md\n" },
          { type: "text", text: "- package.json\n" },
          { type: "text", text: "- src" },
        ],
      },
    ],
  },
};

const createTestFileTurn: ScenarioTurn = {
  user: {
    text: TOOL_FLOW_PROMPTS.CREATE_TEST_FILE,
    thinkingLevel: "medium",
    mode: "exec",
  },
  assistant: {
    messageId: "msg-tool-create-test-file",
    events: [
      {
        kind: "stream-start",
        delay: 0,
        messageId: "msg-tool-create-test-file",
        model: "mock:executor",
      },
      {
        kind: "tool-start",
        delay: STREAM_BASE_DELAY,
        toolCallId: "tool-bash-create-test-file",
        toolName: "bash",
        args: { script: "printf 'hello' > test.txt", timeout_secs: 10 },
      },
      {
        kind: "tool-end",
        delay: STREAM_BASE_DELAY * 2,
        toolCallId: "tool-bash-create-test-file",
        toolName: "bash",
        result: {
          success: true,
          output: "",
          exitCode: 0,
          wall_duration_ms: 90,
        },
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY * 2 + 100,
        text: "Created test.txt with the contents 'hello'.",
      },
      {
        kind: "stream-end",
        delay: STREAM_BASE_DELAY * 3,
        metadata: {
          model: "mock:executor",
          inputTokens: 80,
          outputTokens: 40,
          systemMessageTokens: 12,
        },
        parts: [{ type: "text", text: "Created test.txt with the contents 'hello'." }],
      },
    ],
  },
};

const readTestFileTurn: ScenarioTurn = {
  user: {
    text: TOOL_FLOW_PROMPTS.READ_TEST_FILE,
    thinkingLevel: "low",
    mode: "exec",
  },
  assistant: {
    messageId: "msg-tool-read-test-file",
    events: [
      {
        kind: "stream-start",
        delay: 0,
        messageId: "msg-tool-read-test-file",
        model: "mock:executor",
      },
      {
        kind: "tool-start",
        delay: STREAM_BASE_DELAY,
        toolCallId: "tool-file-read-test-file",
        toolName: "file_read",
        args: { filePath: "test.txt" },
      },
      {
        kind: "tool-end",
        delay: STREAM_BASE_DELAY * 2,
        toolCallId: "tool-file-read-test-file",
        toolName: "file_read",
        result: {
          success: true,
          file_size: 6,
          modifiedTime: "2024-01-01T00:00:00.000Z",
          lines_read: 1,
          content: "1\thello",
          lease: "lease-test-txt",
        },
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY * 2 + 100,
        text: "Here's what's inside test.txt:\n",
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY * 2 + 200,
        text: "1\thello",
      },
      {
        kind: "stream-end",
        delay: STREAM_BASE_DELAY * 3,
        metadata: {
          model: "mock:executor",
          inputTokens: 76,
          outputTokens: 52,
          systemMessageTokens: 12,
        },
        parts: [
          { type: "text", text: "Here's what's inside test.txt:\n" },
          { type: "text", text: "1\thello" },
        ],
      },
    ],
  },
};

const recallTestFileTurn: ScenarioTurn = {
  user: {
    text: TOOL_FLOW_PROMPTS.RECALL_TEST_FILE,
    thinkingLevel: "medium",
    mode: "plan",
  },
  assistant: {
    messageId: "msg-tool-recall-test-file",
    events: [
      {
        kind: "stream-start",
        delay: 0,
        messageId: "msg-tool-recall-test-file",
        model: "mock:planner",
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY,
        text: "You just created test.txt and it contains the line 'hello'.",
      },
      {
        kind: "stream-end",
        delay: STREAM_BASE_DELAY * 2,
        metadata: {
          model: "mock:planner",
          inputTokens: 60,
          outputTokens: 34,
          systemMessageTokens: 10,
        },
        parts: [
          { type: "text", text: "You just created test.txt and it contains the line 'hello'." },
        ],
      },
    ],
  },
};

const reasoningQuicksortTurn: ScenarioTurn = {
  user: {
    text: TOOL_FLOW_PROMPTS.REASONING_QUICKSORT,
    thinkingLevel: "high",
    mode: "plan",
  },
  assistant: {
    messageId: "msg-reasoning-quicksort",
    events: [
      {
        kind: "stream-start",
        delay: 0,
        messageId: "msg-reasoning-quicksort",
        model: "gpt-5-codex",
      },
      {
        kind: "reasoning-delta",
        delay: STREAM_BASE_DELAY,
        text: "Assessing quicksort mechanics and choosing example array...",
      },
      {
        kind: "reasoning-delta",
        delay: STREAM_BASE_DELAY * 2,
        text: "Plan: explain pivot selection, partitioning, recursion, base case.",
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY * 3,
        text: "Quicksort works by picking a pivot, partitioning smaller and larger items around it, then recursing.\n",
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY * 3 + 100,
        text: "1. Choose a pivot (often the middle element for simplicity).\n",
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY * 3 + 200,
        text: "2. Partition: items < pivot move left, items > pivot move right.\n",
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY * 3 + 300,
        text: "3. Recursively quicksort the left and right partitions.\n",
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY * 3 + 400,
        text: "4. Base case: arrays of length 0 or 1 are already sorted.\n",
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY * 3 + 500,
        text: "This yields O(n log n) average time and in-place sorting when implemented carefully.",
      },
      {
        kind: "stream-end",
        delay: STREAM_BASE_DELAY * 4,
        metadata: {
          model: "gpt-5-codex",
          inputTokens: 140,
          outputTokens: 160,
          systemMessageTokens: 24,
        },
        parts: [
          {
            type: "text",
            text: "Quicksort works by picking a pivot, partitioning smaller and larger items around it, then recursing.\n",
          },
          { type: "text", text: "1. Choose a pivot (often the middle element for simplicity).\n" },
          {
            type: "text",
            text: "2. Partition: items < pivot move left, items > pivot move right.\n",
          },
          { type: "text", text: "3. Recursively quicksort the left and right partitions.\n" },
          { type: "text", text: "4. Base case: arrays of length 0 or 1 are already sorted.\n" },
          {
            type: "text",
            text: "This yields O(n log n) average time and in-place sorting when implemented carefully.",
          },
        ],
      },
    ],
  },
};

export const scenarios: ScenarioTurn[] = [
  fileReadTurn,
  listDirectoryTurn,
  createTestFileTurn,
  readTestFileTurn,
  recallTestFileTurn,
  reasoningQuicksortTurn,
];
