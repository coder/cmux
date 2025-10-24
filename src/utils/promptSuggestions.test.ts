import { describe, test, expect } from "bun:test";
import {
  getPromptSuggestions,
  extractPromptMentions,
  expandPromptMentions,
} from "./promptSuggestions";

describe("promptSuggestions", () => {
  const mockPrompts = [
    { name: "test-prompt", path: "/path/to/test-prompt.md", location: "system" as const },
    { name: "explain", path: "/path/to/explain.md", location: "system" as const },
    { name: "repo-prompt", path: "/repo/.cmux/repo-prompt.md", location: "repo" as const },
  ];

  describe("getPromptSuggestions", () => {
    test("returns all prompts when input is just @", () => {
      const input = "@";
      const suggestions = getPromptSuggestions(input, input.length, mockPrompts);
      expect(suggestions.length).toBe(3);
    });

    test("filters prompts by partial name", () => {
      const input = "@test";
      const suggestions = getPromptSuggestions(input, input.length, mockPrompts);
      expect(suggestions.length).toBe(1);
      expect(suggestions[0].name).toBe("test-prompt");
    });

    test("returns empty array when no @ present", () => {
      const input = "no at sign";
      const suggestions = getPromptSuggestions(input, input.length, mockPrompts);
      expect(suggestions).toEqual([]);
    });

    test("returns empty array when space follows @", () => {
      const input = "@ ";
      const suggestions = getPromptSuggestions(input, input.length, mockPrompts);
      expect(suggestions).toEqual([]);
    });

    test("sorts repo prompts before system prompts", () => {
      const input = "@";
      const suggestions = getPromptSuggestions(input, input.length, mockPrompts);
      expect(suggestions[0].location).toBe("repo");
      expect(suggestions[1].location).toBe("system");
      expect(suggestions[2].location).toBe("system");
    });

    test("only considers @ before cursor position", () => {
      const input = "@test @explain";
      // Cursor is after "test" (position 5)
      const suggestions = getPromptSuggestions(input, 5, mockPrompts);
      expect(suggestions.length).toBe(1);
      expect(suggestions[0].name).toBe("test-prompt");
    });

    test("ignores @ after cursor position", () => {
      const input = "@explain @test";
      // Cursor is after "explain" (position 8)
      const suggestions = getPromptSuggestions(input, 8, mockPrompts);
      expect(suggestions.length).toBe(1);
      expect(suggestions[0].name).toBe("explain");
    });
  });

  describe("extractPromptMentions", () => {
    test("extracts single mention", () => {
      const mentions = extractPromptMentions("Please @explain this");
      expect(mentions).toEqual(["explain"]);
    });

    test("extracts multiple mentions", () => {
      const mentions = extractPromptMentions("Use @test-prompt and @explain");
      expect(mentions).toEqual(["test-prompt", "explain"]);
    });

    test("handles hyphens and underscores", () => {
      const mentions = extractPromptMentions("@my-prompt @another_one");
      expect(mentions).toEqual(["my-prompt", "another_one"]);
    });

    test("returns empty array when no mentions", () => {
      const mentions = extractPromptMentions("no mentions here");
      expect(mentions).toEqual([]);
    });
  });

  describe("expandPromptMentions", () => {
    const promptContents = new Map([
      ["explain", "Please explain in detail:"],
      ["test", "This is a test"],
    ]);

    test("expands single mention", () => {
      const input = "Please @explain how it works";
      const expanded = expandPromptMentions(input, promptContents);
      expect(expanded).toBe("Please Please explain in detail: how it works");
    });

    test("expands multiple mentions", () => {
      const input = "@test @explain";
      const expanded = expandPromptMentions(input, promptContents);
      expect(expanded).toBe("This is a test Please explain in detail:");
    });

    test("leaves unknown mentions unchanged", () => {
      const input = "@unknown mention";
      const expanded = expandPromptMentions(input, promptContents);
      expect(expanded).toBe("@unknown mention");
    });

    test("handles mention at word boundary", () => {
      const input = "@test-prompt"; // Should not match "@test" if full name is "test-prompt"
      const expanded = expandPromptMentions(input, promptContents);
      expect(expanded).toBe("@test-prompt"); // No expansion because "test" != "test-prompt"
    });
  });
});
