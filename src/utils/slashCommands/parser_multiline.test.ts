/**
 * Tests to ensure multiline support doesn't break other commands
 */
import { parseCommand } from "./parser";

describe("parser multiline compatibility", () => {
  it("allows /providers with newlines in value", () => {
    const result = parseCommand("/providers set anthropic apiKey\nsk-123");
    expect(result).toEqual({
      type: "providers-set",
      provider: "anthropic",
      keyPath: ["apiKey"],
      value: "sk-123",
    });
  });

  it("allows /providers with newlines between args", () => {
    const result = parseCommand("/providers\nset\nanthropic\napiKey\nsk-456");
    expect(result).toEqual({
      type: "providers-set",
      provider: "anthropic",
      keyPath: ["apiKey"],
      value: "sk-456",
    });
  });

  it("allows /model with newlines", () => {
    const result = parseCommand("/model\nopus");
    expect(result).toEqual({
      type: "model-set",
      modelString: "anthropic:claude-opus-4-1",
    });
  });

  it("allows /truncate with newlines", () => {
    const result = parseCommand("/truncate\n50");
    expect(result).toEqual({
      type: "truncate",
      percentage: 0.5,
    });
  });
});
