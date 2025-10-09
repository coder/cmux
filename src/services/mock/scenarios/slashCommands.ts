import type { ScenarioTurn } from "../scenarioTypes";
import { STREAM_BASE_DELAY } from "../scenarioTypes";

export const SLASH_COMMAND_PROMPTS = {
  MODEL_STATUS: "Please confirm which model is currently active for this conversation.",
} as const;

export const COMPACTION_MESSAGE =
  "Summarize this conversation into a compact form for a new Assistant to continue helping the user. Use approximately 385 words. Keep technical details";

export const COMPACT_SUMMARY_TEXT =
  "Compact summary: The assistant read project files, listed directory contents, created and inspected test.txt, then confirmed the contents remained 'hello'. Technical details preserved.";

const compactConversationTurn: ScenarioTurn = {
  user: {
    text: COMPACTION_MESSAGE,
    thinkingLevel: "medium",
    mode: "plan",
  },
  assistant: {
    messageId: "msg-slash-compact-1",
    events: [
      {
        kind: "stream-start",
        delay: 0,
        messageId: "msg-slash-compact-1",
        model: "anthropic:claude-sonnet-4-5",
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY,
        text: "Preparing a compact technical summary based on prior tool results…\n",
      },
      {
        kind: "tool-start",
        delay: STREAM_BASE_DELAY * 2,
        toolCallId: "tool-compact-summary",
        toolName: "compact_summary",
        args: {
          targetWords: 385,
          instructions: "Keep technical details",
        },
      },
      {
        kind: "tool-end",
        delay: STREAM_BASE_DELAY * 3,
        toolCallId: "tool-compact-summary",
        toolName: "compact_summary",
        result: {
          success: true,
          summary: COMPACT_SUMMARY_TEXT,
          message: "Summary generated successfully.",
        },
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY * 3 + 100,
        text: "Summary ready. Replacing history with the compacted version now.",
      },
      {
        kind: "stream-end",
        delay: STREAM_BASE_DELAY * 4,
        metadata: {
          model: "anthropic:claude-sonnet-4-5",
          inputTokens: 220,
          outputTokens: 96,
          systemMessageTokens: 18,
        },
        parts: [
          {
            type: "text",
            text: "Summary ready. Replacing history with the compacted version now.",
          },
          {
            type: "dynamic-tool",
            toolCallId: "tool-compact-summary",
            toolName: "compact_summary",
            state: "output-available",
            input: {
              targetWords: 385,
              instructions: "Keep technical details",
            },
            output: {
              summary: COMPACT_SUMMARY_TEXT,
            },
          },
        ],
      },
    ],
  },
};

const modelStatusTurn: ScenarioTurn = {
  user: {
    text: SLASH_COMMAND_PROMPTS.MODEL_STATUS,
    thinkingLevel: "low",
    mode: "plan",
  },
  assistant: {
    messageId: "msg-slash-model-status",
    events: [
      {
        kind: "stream-start",
        delay: 0,
        messageId: "msg-slash-model-status",
        model: "anthropic:claude-opus-4-1",
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY,
        text: "Claude Opus 4.1 is now responding with enhanced reasoning capacity.",
      },
      {
        kind: "stream-end",
        delay: STREAM_BASE_DELAY * 2,
        metadata: {
          model: "anthropic:claude-opus-4-1",
          inputTokens: 70,
          outputTokens: 54,
          systemMessageTokens: 12,
        },
        parts: [
          {
            type: "text",
            text: "I'm responding as Claude Opus 4.1, which you selected via /model opus. Let me know how to proceed.",
          },
        ],
      },
    ],
  },
};

export const scenarios: ScenarioTurn[] = [compactConversationTurn, modelStatusTurn];
