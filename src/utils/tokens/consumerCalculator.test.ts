/**
 * Tests for frontend token consumer calculator
 */

import { describe, it, expect } from "@jest/globals";
import { prepareTokenization, calculateConsumers } from "./consumerCalculator";
import type { CmuxMessage } from "@/types/message";

describe("prepareTokenization", () => {
  it("extracts user and assistant text", () => {
    const messages: CmuxMessage[] = [
      {
        id: "1",
        role: "user",
        parts: [{ type: "text", text: "Hello!" }],
      },
      {
        id: "2",
        role: "assistant",
        parts: [{ type: "text", text: "Hi there!" }],
      },
    ];

    const result = prepareTokenization(messages, "anthropic:claude-opus-4");

    expect(result.texts).toEqual(["Hello!", "Hi there!"]);
    expect(result.consumerMap).toEqual(["User", "Assistant"]);
    expect(result.toolDefinitions.size).toBe(0);
  });

  it("extracts reasoning content", () => {
    const messages: CmuxMessage[] = [
      {
        id: "1",
        role: "assistant",
        parts: [
          { type: "reasoning", text: "Let me think..." },
          { type: "text", text: "Here's my answer" },
        ],
      },
    ];

    const result = prepareTokenization(messages, "anthropic:claude-opus-4");

    expect(result.texts).toEqual(["Let me think...", "Here's my answer"]);
    expect(result.consumerMap).toEqual(["Assistant (reasoning)", "Assistant"]);
  });

  it("extracts tool calls and results", () => {
    const messages: CmuxMessage[] = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "call_1",
            toolName: "bash",
            state: "output-available",
            input: { script: "echo hello" },
            output: "hello\n",
          },
        ],
      },
    ];

    const result = prepareTokenization(messages, "anthropic:claude-opus-4");

    // Input and output both counted
    expect(result.texts).toEqual(['{"script":"echo hello"}', "hello\n"]);
    expect(result.consumerMap).toEqual(["bash", "bash"]);
  });

  it("includes tool definitions once per unique tool", () => {
    const messages: CmuxMessage[] = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "call_1",
            toolName: "bash",
            state: "output-available",
            input: { script: "echo 1" },
            output: "1\n",
          },
        ],
      },
      {
        id: "2",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "call_2",
            toolName: "bash",
            state: "output-available",
            input: { script: "echo 2" },
            output: "2\n",
          },
        ],
      },
    ];

    const result = prepareTokenization(messages, "anthropic:claude-opus-4");

    // bash definition should only be included once
    expect(result.toolDefinitions.size).toBe(1);
    expect(result.toolDefinitions.has("bash")).toBe(true);

    // Should have definition in serialized form
    const bashDef = result.toolDefinitions.get("bash");
    expect(bashDef).toContain("bash");
    expect(bashDef).toContain("script");
  });

  it("handles tools with only input (input-available state)", () => {
    const messages: CmuxMessage[] = [
      {
        id: "1",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolCallId: "call_1",
            toolName: "bash",
            state: "input-available",
            input: { script: "echo hello" },
          },
        ],
      },
    ];

    const result = prepareTokenization(messages, "anthropic:claude-opus-4");

    // Only input, no output
    expect(result.texts).toEqual(['{"script":"echo hello"}']);
    expect(result.consumerMap).toEqual(["bash"]);
  });

  it("ignores image parts", () => {
    const messages: CmuxMessage[] = [
      {
        id: "1",
        role: "user",
        parts: [
          { type: "text", text: "Look at this" },
          { type: "image", image: "base64data", mimeType: "image/png" },
        ],
      },
    ];

    const result = prepareTokenization(messages, "anthropic:claude-opus-4");

    // Only text, no image
    expect(result.texts).toEqual(["Look at this"]);
    expect(result.consumerMap).toEqual(["User"]);
  });
});

describe("calculateConsumers", () => {
  it("aggregates tokens by consumer", () => {
    const tokenCounts = [10, 20, 15];
    const consumerMap = ["User", "Assistant", "User"];
    const toolDefCounts = new Map<string, number>();

    const consumers = calculateConsumers(tokenCounts, consumerMap, toolDefCounts);

    expect(consumers).toHaveLength(2);
    expect(consumers.find((c) => c.name === "User")?.tokens).toBe(25); // 10 + 15
    expect(consumers.find((c) => c.name === "Assistant")?.tokens).toBe(20);
  });

  it("calculates percentages correctly", () => {
    const tokenCounts = [50, 50];
    const consumerMap = ["User", "Assistant"];
    const toolDefCounts = new Map<string, number>();

    const consumers = calculateConsumers(tokenCounts, consumerMap, toolDefCounts);

    expect(consumers).toHaveLength(2);
    expect(consumers.find((c) => c.name === "User")?.percentage).toBe(50);
    expect(consumers.find((c) => c.name === "Assistant")?.percentage).toBe(50);
  });

  it("sorts consumers by token count descending", () => {
    const tokenCounts = [10, 50, 30];
    const consumerMap = ["User", "Assistant", "bash"];
    const toolDefCounts = new Map<string, number>();

    const consumers = calculateConsumers(tokenCounts, consumerMap, toolDefCounts);

    expect(consumers).toHaveLength(3);
    expect(consumers[0].name).toBe("Assistant"); // 50 tokens
    expect(consumers[1].name).toBe("bash"); // 30 tokens
    expect(consumers[2].name).toBe("User"); // 10 tokens
  });

  it("tracks fixed and variable tokens separately", () => {
    const tokenCounts = [20, 30]; // variable tokens for tool calls
    const consumerMap = ["bash", "bash"];
    const toolDefCounts = new Map<string, number>([["bash", 65]]); // fixed overhead

    const consumers = calculateConsumers(tokenCounts, consumerMap, toolDefCounts);

    expect(consumers).toHaveLength(1);
    const bashConsumer = consumers[0];
    expect(bashConsumer.name).toBe("bash");
    expect(bashConsumer.tokens).toBe(115); // 65 fixed + 20 + 30 variable
    expect(bashConsumer.fixedTokens).toBe(65);
    expect(bashConsumer.variableTokens).toBe(50);
  });

  it("handles zero total tokens gracefully", () => {
    const tokenCounts: number[] = [];
    const consumerMap: string[] = [];
    const toolDefCounts = new Map<string, number>();

    const consumers = calculateConsumers(tokenCounts, consumerMap, toolDefCounts);

    expect(consumers).toHaveLength(0);
  });

  it("omits fixedTokens and variableTokens when not present", () => {
    const tokenCounts = [100];
    const consumerMap = ["User"];
    const toolDefCounts = new Map<string, number>();

    const consumers = calculateConsumers(tokenCounts, consumerMap, toolDefCounts);

    expect(consumers).toHaveLength(1);
    const userConsumer = consumers[0];
    expect(userConsumer.fixedTokens).toBeUndefined();
    expect(userConsumer.variableTokens).toBe(100);
  });
});
