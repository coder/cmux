import { describe, it, expect } from "bun:test";
import { getSlashCommandSuggestions } from "./slashCommands";

describe("getSlashCommandSuggestions", () => {
  it("returns empty suggestions for non-commands", () => {
    expect(getSlashCommandSuggestions("hello")).toEqual([]);
    expect(getSlashCommandSuggestions("")).toEqual([]);
  });

  it("suggests top level commands when starting with slash", () => {
    const suggestions = getSlashCommandSuggestions("/");
    const labels = suggestions.map((s) => s.display);

    expect(labels).toContain("/clear");
    expect(labels).toContain("/providers");
    expect(labels).toContain("/model");
  });

  it("filters top level commands by partial input", () => {
    const suggestions = getSlashCommandSuggestions("/cl");
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].replacement).toBe("/clear");
  });

  it("suggests provider subcommands", () => {
    const suggestions = getSlashCommandSuggestions("/providers ");
    expect(suggestions.map((s) => s.display)).toContain("set");
  });

  it("suggests provider names after /providers set", () => {
    const suggestions = getSlashCommandSuggestions("/providers set ", {
      providerNames: ["anthropic"],
    });
    const labels = suggestions.map((s) => s.display);

    expect(labels).toContain("anthropic");
  });

  it("suggests provider keys after selecting a provider", () => {
    const suggestions = getSlashCommandSuggestions("/providers set anthropic ");
    const keys = suggestions.map((s) => s.display);

    expect(keys).toContain("apiKey");
    expect(keys).toContain("baseUrl");
  });

  it("filters provider keys by partial input", () => {
    const suggestions = getSlashCommandSuggestions("/providers set anthropic api", {
      providerNames: ["anthropic"],
    });

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].display).toBe("apiKey");
  });

  it("suggests model aliases and providers after /model", () => {
    const suggestions = getSlashCommandSuggestions("/model ", {
      providerNames: ["anthropic"],
    });

    const labels = suggestions.map((s) => s.display);
    expect(labels).toContain("opus");
    expect(labels).toContain("sonnet");
    expect(labels).toContain("anthropic");
  });

  it("filters model alias suggestions by partial input", () => {
    const suggestions = getSlashCommandSuggestions("/model op");
    expect(suggestions.map((s) => s.display)).toContain("opus");
    expect(suggestions.map((s) => s.display)).not.toContain("sonnet");
  });

  it("suggests provider models after selecting a provider", () => {
    const suggestions = getSlashCommandSuggestions("/model anthropic ");
    const labels = suggestions.map((s) => s.display);
    expect(labels).toContain("claude-opus-4-1");
  });

  it("filters provider model suggestions by partial input", () => {
    const suggestions = getSlashCommandSuggestions("/model openai gpt-4");
    const labels = suggestions.map((s) => s.display);
    expect(labels.some((label) => label.startsWith("gpt-4"))).toBe(true);
  });
});
