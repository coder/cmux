import type { ScenarioTurn } from "../scenarioTypes";
import { STREAM_BASE_DELAY } from "../scenarioTypes";

export const LIST_PROGRAMMING_LANGUAGES = "List 3 programming languages";

const listProgrammingLanguagesTurn: ScenarioTurn = {
  user: {
    text: LIST_PROGRAMMING_LANGUAGES,
    thinkingLevel: "low",
    mode: "plan",
  },
  assistant: {
    messageId: "msg-basic-1",
    events: [
      { kind: "stream-start", delay: 0, messageId: "msg-basic-1", model: "mock:planner" },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY,
        text: "Here are three programming languages:\n",
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY * 2,
        text: "1. Python\n",
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY * 3,
        text: "2. JavaScript\n",
      },
      {
        kind: "stream-delta",
        delay: STREAM_BASE_DELAY * 4,
        text: "3. Rust",
      },
      {
        kind: "stream-end",
        delay: STREAM_BASE_DELAY * 5,
        metadata: {
          model: "mock:planner",
          inputTokens: 64,
          outputTokens: 48,
          systemMessageTokens: 12,
        },
        parts: [
          { type: "text", text: "Here are three programming languages:\n" },
          { type: "text", text: "1. Python\n" },
          { type: "text", text: "2. JavaScript\n" },
          { type: "text", text: "3. Rust" },
        ],
      },
    ],
  },
};

export const scenarios: ScenarioTurn[] = [listProgrammingLanguagesTurn];
