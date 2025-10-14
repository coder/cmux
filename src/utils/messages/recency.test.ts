import { computeRecencyTimestamp } from "./recency";
import { createCmuxMessage } from "@/types/message";

describe("computeRecencyTimestamp", () => {
  it("returns null for empty messages array", () => {
    expect(computeRecencyTimestamp([])).toBeNull();
  });

  it("returns null when no messages have timestamps", () => {
    const messages = [
      createCmuxMessage("1", "user", "hello"),
      createCmuxMessage("2", "assistant", "hi"),
    ];
    expect(computeRecencyTimestamp(messages)).toBeNull();
  });

  it("returns last user message timestamp", () => {
    const messages = [
      createCmuxMessage("1", "user", "first", { timestamp: 100 }),
      createCmuxMessage("2", "assistant", "reply", { timestamp: 200 }),
      createCmuxMessage("3", "user", "second", { timestamp: 300 }),
    ];
    expect(computeRecencyTimestamp(messages)).toBe(300);
  });

  it("prioritizes user message over compacted message", () => {
    const messages = [
      createCmuxMessage("1", "user", "user msg", { timestamp: 100 }),
      createCmuxMessage("2", "assistant", "compacted", {
        timestamp: 200,
        compacted: true,
      }),
    ];
    expect(computeRecencyTimestamp(messages)).toBe(100);
  });

  it("falls back to compacted message when no user messages", () => {
    const messages = [
      createCmuxMessage("1", "assistant", "response"),
      createCmuxMessage("2", "assistant", "compacted summary", {
        timestamp: 150,
        compacted: true,
      }),
    ];
    expect(computeRecencyTimestamp(messages)).toBe(150);
  });

  it("uses most recent user message when multiple exist", () => {
    const messages = [
      createCmuxMessage("1", "user", "old", { timestamp: 100 }),
      createCmuxMessage("2", "user", "middle", { timestamp: 200 }),
      createCmuxMessage("3", "assistant", "reply"),
      createCmuxMessage("4", "user", "newest", { timestamp: 300 }),
    ];
    expect(computeRecencyTimestamp(messages)).toBe(300);
  });

  it("uses most recent compacted message as fallback", () => {
    const messages = [
      createCmuxMessage("1", "assistant", "old summary", {
        timestamp: 100,
        compacted: true,
      }),
      createCmuxMessage("2", "assistant", "response"),
      createCmuxMessage("3", "assistant", "newer summary", {
        timestamp: 200,
        compacted: true,
      }),
    ];
    expect(computeRecencyTimestamp(messages)).toBe(200);
  });

  it("handles messages with metadata but no timestamp", () => {
    const messages = [
      createCmuxMessage("1", "user", "hello", { model: "claude" }),
      createCmuxMessage("2", "assistant", "hi", { duration: 100 }),
    ];
    expect(computeRecencyTimestamp(messages)).toBeNull();
  });

  it("ignores assistant messages without compacted flag", () => {
    const messages = [
      createCmuxMessage("1", "assistant", "regular", { timestamp: 100 }),
      createCmuxMessage("2", "assistant", "another", { timestamp: 200 }),
    ];
    expect(computeRecencyTimestamp(messages)).toBeNull();
  });

  it("handles mixed messages with only some having timestamps", () => {
    const messages = [
      createCmuxMessage("1", "user", "no timestamp"),
      createCmuxMessage("2", "user", "has timestamp", { timestamp: 150 }),
      createCmuxMessage("3", "user", "no timestamp again"),
    ];
    expect(computeRecencyTimestamp(messages)).toBe(150);
  });

  it("handles user messages in middle of array", () => {
    const messages = [
      createCmuxMessage("1", "assistant", "start"),
      createCmuxMessage("2", "user", "middle", { timestamp: 250 }),
      createCmuxMessage("3", "assistant", "end"),
    ];
    expect(computeRecencyTimestamp(messages)).toBe(250);
  });
});
