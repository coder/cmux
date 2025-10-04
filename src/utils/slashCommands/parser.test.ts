import { describe, it, expect } from "bun:test";
import { parseCommand, setNestedProperty } from "./parser";

// Test helpers
const expectParse = (input: string, expected: ReturnType<typeof parseCommand>) => {
  expect(parseCommand(input)).toEqual(expected);
};

const expectProvidersSet = (input: string, provider: string, keyPath: string[], value: string) => {
  expectParse(input, { type: "providers-set", provider, keyPath, value });
};

const expectModelSet = (input: string, modelString: string) => {
  expectParse(input, { type: "model-set", modelString });
};

describe("commandParser", () => {
  describe("parseCommand", () => {
    it("should return null for non-command input", () => {
      expect(parseCommand("hello world")).toBeNull();
      expect(parseCommand("")).toBeNull();
      expect(parseCommand(" ")).toBeNull();
    });

    it("should parse /clear command", () => {
      expectParse("/clear", { type: "clear" });
    });

    it("should parse /providers help when no subcommand", () => {
      expectParse("/providers", { type: "providers-help" });
    });

    it("should parse /providers with invalid subcommand", () => {
      expectParse("/providers invalid", {
        type: "providers-invalid-subcommand",
        subcommand: "invalid",
      });
    });

    it("should parse /providers set with missing args", () => {
      const missingArgsCases = [
        { input: "/providers set", argCount: 0 },
        { input: "/providers set anthropic", argCount: 1 },
        { input: "/providers set anthropic apiKey", argCount: 2 },
      ];

      missingArgsCases.forEach(({ input, argCount }) => {
        expectParse(input, {
          type: "providers-missing-args",
          subcommand: "set",
          argCount,
        });
      });
    });

    it("should parse /providers set with all arguments", () => {
      expectProvidersSet(
        "/providers set anthropic apiKey sk-123",
        "anthropic",
        ["apiKey"],
        "sk-123"
      );
    });

    it("should handle quoted arguments", () => {
      expectProvidersSet(
        '/providers set anthropic apiKey "my key with spaces"',
        "anthropic",
        ["apiKey"],
        "my key with spaces"
      );
    });

    it("should handle multiple spaces in value", () => {
      expectProvidersSet(
        "/providers set anthropic apiKey My Anthropic API",
        "anthropic",
        ["apiKey"],
        "My Anthropic API"
      );
    });

    it("should handle nested key paths", () => {
      expectProvidersSet(
        "/providers set anthropic baseUrl.scheme https",
        "anthropic",
        ["baseUrl", "scheme"],
        "https"
      );
    });

    it("should parse unknown commands", () => {
      expectParse("/foo", {
        type: "unknown-command",
        command: "foo",
        subcommand: undefined,
      });

      expectParse("/foo bar", {
        type: "unknown-command",
        command: "foo",
        subcommand: "bar",
      });
    });

    it("should handle multiple spaces between arguments", () => {
      expectProvidersSet(
        "/providers   set   anthropic   apiKey   sk-12345",
        "anthropic",
        ["apiKey"],
        "sk-12345"
      );
    });

    it("should handle quoted URL values", () => {
      expectProvidersSet(
        '/providers set anthropic baseUrl "https://api.anthropic.com/v1"',
        "anthropic",
        ["baseUrl"],
        "https://api.anthropic.com/v1"
      );
    });

    it("should parse /model with abbreviation", () => {
      expectModelSet("/model opus", "anthropic:claude-opus-4-1");
    });

    it("should parse /model with full provider:model format", () => {
      expectModelSet("/model anthropic:claude-sonnet-4-5", "anthropic:claude-sonnet-4-5");
    });

    it("should parse /model help when no args", () => {
      expectParse("/model", { type: "model-help" });
    });

    it("should handle unknown abbreviation as full model string", () => {
      expectModelSet("/model custom:model-name", "custom:model-name");
    });

    it("should reject /model with too many arguments", () => {
      expectParse("/model anthropic claude extra", {
        type: "unknown-command",
        command: "model",
        subcommand: "claude",
      });
    });
  });

  describe("setNestedProperty", () => {
    it("should set simple property", () => {
      const obj: Record<string, unknown> = {};
      setNestedProperty(obj, ["apiKey"], "sk-12345");
      expect(obj).toEqual({ apiKey: "sk-12345" });
    });

    it("should set nested property", () => {
      const obj: Record<string, unknown> = {};
      setNestedProperty(obj, ["baseUrl", "scheme"], "https");
      expect(obj).toEqual({
        baseUrl: {
          scheme: "https",
        },
      });
    });

    it("should create nested objects as needed", () => {
      const obj: Record<string, unknown> = { existing: "value" };
      setNestedProperty(obj, ["deep", "nested", "key"], "value");
      expect(obj).toEqual({
        existing: "value",
        deep: {
          nested: {
            key: "value",
          },
        },
      });
    });

    it("should overwrite existing values", () => {
      const obj: Record<string, unknown> = { apiKey: "old" };
      setNestedProperty(obj, ["apiKey"], "new");
      expect(obj).toEqual({ apiKey: "new" });
    });

    it("should handle empty keyPath", () => {
      const obj: Record<string, unknown> = { existing: "value" };
      setNestedProperty(obj, [], "ignored");
      expect(obj).toEqual({ existing: "value" });
    });
  });
});
