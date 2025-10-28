import { describe, it, expect } from "bun:test";
import { TOOL_DEFINITIONS } from "@/utils/tools/toolDefinitions";

describe("status_set schema validation", () => {
  const schema = TOOL_DEFINITIONS.status_set.schema;

  describe("emoji validation", () => {
    it("should accept single emoji characters", () => {
      expect(() => schema.parse({ emoji: "🔍", message: "Test" })).not.toThrow();
      expect(() => schema.parse({ emoji: "📝", message: "Test" })).not.toThrow();
      expect(() => schema.parse({ emoji: "✅", message: "Test" })).not.toThrow();
      expect(() => schema.parse({ emoji: "🚀", message: "Test" })).not.toThrow();
      expect(() => schema.parse({ emoji: "⏳", message: "Test" })).not.toThrow();
    });

    it("should reject multiple emojis", () => {
      expect(() => schema.parse({ emoji: "🔍📝", message: "Test" })).toThrow();
      expect(() => schema.parse({ emoji: "✅✅", message: "Test" })).toThrow();
    });

    it("should reject text (non-emoji)", () => {
      expect(() => schema.parse({ emoji: "a", message: "Test" })).toThrow();
      expect(() => schema.parse({ emoji: "abc", message: "Test" })).toThrow();
      expect(() => schema.parse({ emoji: "!", message: "Test" })).toThrow();
    });

    it("should reject empty emoji", () => {
      expect(() => schema.parse({ emoji: "", message: "Test" })).toThrow();
    });

    it("should reject emoji with text", () => {
      expect(() => schema.parse({ emoji: "🔍a", message: "Test" })).toThrow();
      expect(() => schema.parse({ emoji: "x🔍", message: "Test" })).toThrow();
    });
  });

  describe("message validation", () => {
    it("should accept messages up to 40 characters", () => {
      expect(() => schema.parse({ emoji: "✅", message: "a".repeat(40) })).not.toThrow();
      expect(() => schema.parse({ emoji: "✅", message: "Analyzing code structure" })).not.toThrow();
      expect(() => schema.parse({ emoji: "✅", message: "Done" })).not.toThrow();
    });

    it("should reject messages over 40 characters", () => {
      expect(() => schema.parse({ emoji: "✅", message: "a".repeat(41) })).toThrow();
      expect(() => schema.parse({ emoji: "✅", message: "a".repeat(50) })).toThrow();
    });

    it("should accept empty message", () => {
      expect(() => schema.parse({ emoji: "✅", message: "" })).not.toThrow();
    });
  });
});

