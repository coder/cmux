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

  it("returns max of user message and compacted message timestamps", () => {
    const messages = [
      createCmuxMessage("1", "user", "user msg", { timestamp: 100 }),
      createCmuxMessage("2", "assistant", "compacted", {
        timestamp: 200,
        compacted: true,
      }),
    ];
    // Now uses max() instead of priority order
    expect(computeRecencyTimestamp(messages)).toBe(200);
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

  // Tests for createdAt parameter
  describe("with createdAt parameter", () => {
    it("returns createdAt timestamp when no messages exist", () => {
      const createdAt = "2024-01-15T10:30:00.000Z";
      const expectedTimestamp = new Date(createdAt).getTime();
      expect(computeRecencyTimestamp([], createdAt)).toBe(expectedTimestamp);
    });

    it("returns max of createdAt and user message timestamp", () => {
      const createdAt = "2024-01-15T10:30:00.000Z"; // 1705316400000
      const createdTimestamp = new Date(createdAt).getTime();

      // Old message (before workspace created)
      const messages = [
        createCmuxMessage("1", "user", "old message", { timestamp: createdTimestamp - 1000 }),
      ];
      expect(computeRecencyTimestamp(messages, createdAt)).toBe(createdTimestamp);
    });

    it("returns user message timestamp when newer than createdAt", () => {
      const createdAt = "2024-01-15T10:30:00.000Z";
      const createdTimestamp = new Date(createdAt).getTime();

      // New message (after workspace created)
      const messages = [
        createCmuxMessage("1", "user", "new message", { timestamp: createdTimestamp + 5000 }),
      ];
      expect(computeRecencyTimestamp(messages, createdAt)).toBe(createdTimestamp + 5000);
    });

    it("returns max of createdAt, user message, and compacted message", () => {
      const createdAt = "2024-01-15T10:30:00.000Z";
      const createdTimestamp = new Date(createdAt).getTime();

      const messages = [
        createCmuxMessage("1", "user", "old user", { timestamp: createdTimestamp - 5000 }),
        createCmuxMessage("2", "assistant", "old compacted", {
          timestamp: createdTimestamp - 2000,
          compacted: true,
        }),
      ];

      // createdAt is newest
      expect(computeRecencyTimestamp(messages, createdAt)).toBe(createdTimestamp);
    });

    it("uses user message when it's the maximum", () => {
      const createdAt = "2024-01-15T10:30:00.000Z";
      const createdTimestamp = new Date(createdAt).getTime();

      const messages = [
        createCmuxMessage("1", "user", "newest", { timestamp: createdTimestamp + 10000 }),
        createCmuxMessage("2", "assistant", "compacted", {
          timestamp: createdTimestamp + 5000,
          compacted: true,
        }),
      ];

      // User message is newest
      expect(computeRecencyTimestamp(messages, createdAt)).toBe(createdTimestamp + 10000);
    });

    it("handles invalid createdAt gracefully", () => {
      const messages = [createCmuxMessage("1", "user", "msg", { timestamp: 100 })];

      // Invalid ISO string should result in NaN timestamp, which gets filtered out
      expect(computeRecencyTimestamp(messages, "invalid-date")).toBe(100);
    });

    it("returns null when no messages and no valid createdAt", () => {
      expect(computeRecencyTimestamp([])).toBeNull();
      expect(computeRecencyTimestamp([], undefined)).toBeNull();
    });
  });
});
