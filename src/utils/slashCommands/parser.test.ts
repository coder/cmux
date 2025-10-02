import { describe, it, expect } from "bun:test";
import { parseCommand, setNestedProperty } from "./parser";

describe("commandParser", () => {
  describe("parseCommand", () => {
    it("should return null for non-command input", () => {
      expect(parseCommand("hello world")).toBeNull();
      expect(parseCommand("")).toBeNull();
      expect(parseCommand(" ")).toBeNull();
    });

    it("should parse /clear command", () => {
      const result = parseCommand("/clear");
      expect(result).toEqual({
        type: "clear",
      });
    });

    it("should parse /providers help when no subcommand", () => {
      const result = parseCommand("/providers");
      expect(result).toEqual({
        type: "providers-help",
      });
    });

    it("should parse /providers with invalid subcommand", () => {
      const result = parseCommand("/providers invalid");
      expect(result).toEqual({
        type: "providers-invalid-subcommand",
        subcommand: "invalid",
      });
    });

    it("should parse /providers set with missing args", () => {
      expect(parseCommand("/providers set")).toEqual({
        type: "providers-missing-args",
        subcommand: "set",
        argCount: 0,
      });

      expect(parseCommand("/providers set anthropic")).toEqual({
        type: "providers-missing-args",
        subcommand: "set",
        argCount: 1,
      });

      expect(parseCommand("/providers set anthropic apiKey")).toEqual({
        type: "providers-missing-args",
        subcommand: "set",
        argCount: 2,
      });
    });

    it("should parse /providers set with all arguments", () => {
      const result = parseCommand("/providers set anthropic apiKey sk-123");
      expect(result).toEqual({
        type: "providers-set",
        provider: "anthropic",
        keyPath: ["apiKey"],
        value: "sk-123",
      });
    });

    it("should handle quoted arguments", () => {
      const result = parseCommand('/providers set anthropic apiKey "my key with spaces"');
      expect(result).toEqual({
        type: "providers-set",
        provider: "anthropic",
        keyPath: ["apiKey"],
        value: "my key with spaces",
      });
    });

    it("should handle multiple spaces in value", () => {
      const result = parseCommand("/providers set anthropic apiKey My Anthropic API");
      expect(result).toEqual({
        type: "providers-set",
        provider: "anthropic",
        keyPath: ["apiKey"],
        value: "My Anthropic API",
      });
    });

    it("should handle nested key paths", () => {
      const result = parseCommand("/providers set anthropic baseUrl.scheme https");
      expect(result).toEqual({
        type: "providers-set",
        provider: "anthropic",
        keyPath: ["baseUrl", "scheme"],
        value: "https",
      });
    });

    it("should parse unknown commands", () => {
      expect(parseCommand("/foo")).toEqual({
        type: "unknown-command",
        command: "foo",
        subcommand: undefined,
      });

      expect(parseCommand("/foo bar")).toEqual({
        type: "unknown-command",
        command: "foo",
        subcommand: "bar",
      });
    });

    it("should handle multiple spaces between arguments", () => {
      const result = parseCommand("/providers   set   anthropic   apiKey   sk-12345");
      expect(result).toEqual({
        type: "providers-set",
        provider: "anthropic",
        keyPath: ["apiKey"],
        value: "sk-12345",
      });
    });

    it("should handle quoted URL values", () => {
      const result = parseCommand(
        '/providers set anthropic baseUrl "https://api.anthropic.com/v1"'
      );
      expect(result).toEqual({
        type: "providers-set",
        provider: "anthropic",
        keyPath: ["baseUrl"],
        value: "https://api.anthropic.com/v1",
      });
    });

    it("should parse /model with abbreviation", () => {
      const result = parseCommand("/model opus");
      expect(result).toEqual({
        type: "model-set",
        modelString: "anthropic:claude-opus-4-1",
      });
    });

    it("should parse /model with full provider:model format", () => {
      const result = parseCommand("/model anthropic:claude-sonnet-4-5");
      expect(result).toEqual({
        type: "model-set",
        modelString: "anthropic:claude-sonnet-4-5",
      });
    });

    it("should parse /model help when no args", () => {
      const result = parseCommand("/model");
      expect(result).toEqual({
        type: "model-help",
      });
    });

    it("should handle unknown abbreviation as full model string", () => {
      const result = parseCommand("/model custom:model-name");
      expect(result).toEqual({
        type: "model-set",
        modelString: "custom:model-name",
      });
    });

    it("should reject /model with too many arguments", () => {
      const result = parseCommand("/model anthropic claude extra");
      expect(result).toEqual({
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
