import { describe, it, expect } from "bun:test";
import {
  parseCommand,
  processCommand,
  parseAndProcessCommand,
  setNestedProperty,
} from "./commandProcessor";

describe("commandProcessor", () => {
  describe("parseCommand", () => {
    it("should return null for non-command input", () => {
      expect(parseCommand("hello world")).toBeNull();
      expect(parseCommand("")).toBeNull();
      expect(parseCommand(" ")).toBeNull();
    });

    it("should parse simple commands", () => {
      const result = parseCommand("/clear");
      expect(result).toEqual({
        command: "clear",
        subcommand: undefined,
        args: [],
      });
    });

    it("should parse commands with subcommands", () => {
      const result = parseCommand("/providers list");
      expect(result).toEqual({
        command: "providers",
        subcommand: "list",
        args: [],
      });
    });

    it("should parse commands with arguments", () => {
      const result = parseCommand("/providers set anthropic apiKey sk-12345");
      expect(result).toEqual({
        command: "providers",
        subcommand: "set",
        args: ["anthropic", "apiKey", "sk-12345"],
      });
    });

    it("should handle quoted arguments with spaces", () => {
      const result = parseCommand(
        '/providers set anthropic baseUrl "https://api.anthropic.com/v1"'
      );
      expect(result).toEqual({
        command: "providers",
        subcommand: "set",
        args: ["anthropic", "baseUrl", "https://api.anthropic.com/v1"],
      });
    });

    it("should handle multiple spaces between arguments", () => {
      const result = parseCommand("/providers   set   anthropic   apiKey   sk-12345");
      expect(result).toEqual({
        command: "providers",
        subcommand: "set",
        args: ["anthropic", "apiKey", "sk-12345"],
      });
    });
  });

  describe("processCommand", () => {
    it("should process providers set command", () => {
      const parsed = {
        command: "providers",
        subcommand: "set",
        args: ["anthropic", "apiKey", "sk-12345"],
      };
      const result = processCommand(parsed);
      expect(result).toEqual({
        type: "providers-set",
        provider: "anthropic",
        keyPath: ["apiKey"],
        value: "sk-12345",
      });
    });

    it("should handle nested key paths with dots", () => {
      const parsed = {
        command: "providers",
        subcommand: "set",
        args: ["anthropic", "baseUrl.scheme", "https"],
      };
      const result = processCommand(parsed);
      expect(result).toEqual({
        type: "providers-set",
        provider: "anthropic",
        keyPath: ["baseUrl", "scheme"],
        value: "https",
      });
    });

    it("should handle values with spaces", () => {
      const parsed = {
        command: "providers",
        subcommand: "set",
        args: ["anthropic", "description", "My", "Anthropic", "API"],
      };
      const result = processCommand(parsed);
      expect(result).toEqual({
        type: "providers-set",
        provider: "anthropic",
        keyPath: ["description"],
        value: "My Anthropic API",
      });
    });

    it("should return unknown for invalid providers commands", () => {
      const parsed = {
        command: "providers",
        subcommand: "invalid",
        args: [],
      };
      const result = processCommand(parsed);
      expect(result).toEqual({
        type: "unknown",
        raw: "/providers invalid",
      });
    });

    it("should return invalid-syntax for providers set with no args", () => {
      const parsed = {
        command: "providers",
        subcommand: "set",
        args: [],
      };
      const result = processCommand(parsed);
      expect(result).toEqual({
        type: "invalid-syntax",
        command: "/providers set",
        message: "Missing provider, key, and value. Usage: /providers set <provider> <key> <value>",
      });
    });

    it("should return invalid-syntax for providers set with only provider", () => {
      const parsed = {
        command: "providers",
        subcommand: "set",
        args: ["anthropic"],
      };
      const result = processCommand(parsed);
      expect(result).toEqual({
        type: "invalid-syntax",
        command: "/providers set",
        message: "Missing key and value. Usage: /providers set <provider> <key> <value>",
      });
    });

    it("should return invalid-syntax for providers set with provider and key only", () => {
      const parsed = {
        command: "providers",
        subcommand: "set",
        args: ["anthropic", "apiKey"],
      };
      const result = processCommand(parsed);
      expect(result).toEqual({
        type: "invalid-syntax",
        command: "/providers set",
        message: "Missing value. Usage: /providers set <provider> <key> <value>",
      });
    });

    it("should return unknown for unknown commands", () => {
      const parsed = {
        command: "unknown",
        subcommand: undefined,
        args: [],
      };
      const result = processCommand(parsed);
      expect(result).toEqual({
        type: "unknown",
        raw: "/unknown",
      });
    });
  });

  describe("parseAndProcessCommand", () => {
    it("should return null for non-commands", () => {
      expect(parseAndProcessCommand("hello")).toBeNull();
    });

    it("should parse and process providers set command", () => {
      const result = parseAndProcessCommand("/providers set anthropic apiKey sk-12345");
      expect(result).toEqual({
        type: "providers-set",
        provider: "anthropic",
        keyPath: ["apiKey"],
        value: "sk-12345",
      });
    });

    it("should handle unknown commands", () => {
      const result = parseAndProcessCommand("/unknown command");
      expect(result).toEqual({
        type: "unknown",
        raw: "/unknown command",
      });
    });
  });

  describe("setNestedProperty", () => {
    it("should set simple properties", () => {
      const obj: Record<string, unknown> = {};
      setNestedProperty(obj, ["apiKey"], "sk-12345");
      expect(obj).toEqual({ apiKey: "sk-12345" });
    });

    it("should set nested properties", () => {
      const obj: Record<string, unknown> = {};
      setNestedProperty(obj, ["baseUrl", "scheme"], "https");
      expect(obj).toEqual({
        baseUrl: {
          scheme: "https",
        },
      });
    });

    it("should overwrite existing properties", () => {
      const obj: Record<string, unknown> = {
        apiKey: "old-key",
      };
      setNestedProperty(obj, ["apiKey"], "new-key");
      expect(obj).toEqual({ apiKey: "new-key" });
    });

    it("should create nested objects as needed", () => {
      const obj: Record<string, unknown> = {
        existing: "value",
      };
      setNestedProperty(obj, ["deeply", "nested", "key"], "value");
      expect(obj).toEqual({
        existing: "value",
        deeply: {
          nested: {
            key: "value",
          },
        },
      });
    });

    it("should handle empty keyPath gracefully", () => {
      const obj: Record<string, unknown> = { existing: "value" };
      setNestedProperty(obj, [], "ignored");
      expect(obj).toEqual({ existing: "value" });
    });

    it("should replace non-object values with objects when nesting", () => {
      const obj: Record<string, unknown> = {
        baseUrl: "string-value",
      };
      setNestedProperty(obj, ["baseUrl", "scheme"], "https");
      expect(obj).toEqual({
        baseUrl: {
          scheme: "https",
        },
      });
    });
  });
});
