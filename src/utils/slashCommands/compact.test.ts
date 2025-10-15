/**
 * Tests for compact command parser using minimist
 */
import { parseCommand } from "./parser";

describe("compact command parser", () => {
  it("parses basic compact command", () => {
    const result = parseCommand("/compact");
    expect(result).toEqual({
      type: "compact",
      maxOutputTokens: undefined,
      continueMessage: undefined,
    });
  });

  it("parses -t flag with token count", () => {
    const result = parseCommand("/compact -t 5000");
    expect(result).toEqual({
      type: "compact",
      maxOutputTokens: 5000,
      continueMessage: undefined,
    });
  });

  it("parses -c with message", () => {
    const result = parseCommand('/compact -c "Continue where we left off"');
    expect(result).toEqual({
      type: "compact",
      maxOutputTokens: undefined,
      continueMessage: "Continue where we left off",
    });
  });

  it("parses both flags in order -c -t", () => {
    const result = parseCommand('/compact -c "Keep going" -t 3000');
    expect(result).toEqual({
      type: "compact",
      maxOutputTokens: 3000,
      continueMessage: "Keep going",
    });
  });

  it("parses both flags in order -t -c", () => {
    const result = parseCommand('/compact -t 3000 -c "Keep going"');
    expect(result).toEqual({
      type: "compact",
      maxOutputTokens: 3000,
      continueMessage: "Keep going",
    });
  });

  it("handles -c without message (undefined)", () => {
    const result = parseCommand("/compact -c");
    expect(result).toEqual({
      type: "compact",
      maxOutputTokens: undefined,
      continueMessage: undefined,
    });
  });

  it("parses -c with unquoted single word", () => {
    const result = parseCommand("/compact -c Keep");
    expect(result).toEqual({
      type: "compact",
      maxOutputTokens: undefined,
      continueMessage: "Keep",
    });
  });

  it("rejects double-dash syntax (use single dash)", () => {
    // minimist doesn't treat --t=value the same way, so we reject it
    const result = parseCommand("/compact --t=5000");
    expect(result).toEqual({
      type: "unknown-command",
      command: "compact",
      subcommand: "Unknown flag: --t=5000",
    });
  });

  it("rejects unknown flags", () => {
    const result = parseCommand("/compact -x");
    expect(result).toEqual({
      type: "unknown-command",
      command: "compact",
      subcommand: "Unknown flag: -x",
    });
  });

  it("rejects invalid token count", () => {
    const result = parseCommand("/compact -t abc");
    expect(result).toEqual({
      type: "unknown-command",
      command: "compact",
      subcommand: "-t requires a positive number, got abc",
    });
  });

  it("rejects negative token count as unknown flag", () => {
    // -100 is parsed as a separate flag, not the value for -t
    const result = parseCommand("/compact -t -100");
    expect(result).toEqual({
      type: "unknown-command",
      command: "compact",
      subcommand: "Unknown flag: -100",
    });
  });

  it("rejects zero token count", () => {
    const result = parseCommand("/compact -t 0");
    expect(result).toEqual({
      type: "unknown-command",
      command: "compact",
      subcommand: "-t requires a positive number, got 0",
    });
  });
});

it("rejects extra positional arguments", () => {
  const result = parseCommand("/compact extra");
  expect(result).toEqual({
    type: "unknown-command",
    command: "compact",
    subcommand: "Unexpected argument: extra",
  });
});

it("rejects positional arguments with flags", () => {
  const result = parseCommand("/compact -t 5000 extra");
  expect(result).toEqual({
    type: "unknown-command",
    command: "compact",
    subcommand: "Unexpected argument: extra",
  });
});

describe("multiline continue messages", () => {
  it("parses basic multiline continue message", () => {
    const result = parseCommand("/compact\nContinue implementing the auth system");
    expect(result).toEqual({
      type: "compact",
      maxOutputTokens: undefined,
      continueMessage: "Continue implementing the auth system",
    });
  });

  it("parses multiline with -t flag", () => {
    const result = parseCommand("/compact -t 5000\nKeep working on the feature");
    expect(result).toEqual({
      type: "compact",
      maxOutputTokens: 5000,
      continueMessage: "Keep working on the feature",
    });
  });

  it("parses multiline message with multiple lines", () => {
    const result = parseCommand("/compact\nLine 1\nLine 2\nLine 3");
    expect(result).toEqual({
      type: "compact",
      maxOutputTokens: undefined,
      continueMessage: "Line 1\nLine 2\nLine 3",
    });
  });

  it("handles empty lines in multiline message", () => {
    const result = parseCommand("/compact\n\nContinue after empty line");
    expect(result).toEqual({
      type: "compact",
      maxOutputTokens: undefined,
      continueMessage: "Continue after empty line",
    });
  });

  it("preserves whitespace in multiline content", () => {
    const result = parseCommand("/compact\n  Indented message\n    More indented");
    expect(result).toEqual({
      type: "compact",
      maxOutputTokens: undefined,
      continueMessage: "Indented message\n    More indented",
    });
  });

  it("prioritizes -c flag over multiline content (backwards compat)", () => {
    const result = parseCommand('/compact -c "Flag message"\nMultiline message');
    expect(result).toEqual({
      type: "compact",
      maxOutputTokens: undefined,
      continueMessage: "Flag message",
    });
  });

  it("handles -c flag with multiline (flag wins)", () => {
    const result = parseCommand('/compact -t 3000 -c "Keep going"\nThis should be ignored');
    expect(result).toEqual({
      type: "compact",
      maxOutputTokens: 3000,
      continueMessage: "Keep going",
    });
  });

  it("ignores trailing newlines", () => {
    const result = parseCommand("/compact\nContinue here\n\n\n");
    expect(result).toEqual({
      type: "compact",
      maxOutputTokens: undefined,
      continueMessage: "Continue here",
    });
  });

  it("returns undefined continueMessage when only whitespace after command", () => {
    const result = parseCommand("/compact\n   \n  \n");
    expect(result).toEqual({
      type: "compact",
      maxOutputTokens: undefined,
      continueMessage: undefined,
    });
  });

  it("does not parse lines after newline as flags", () => {
    // Bug: multiline content starting with -t or -c should not be parsed as flags
    const result = parseCommand("/compact\n-t should be treated as message content");
    expect(result).toEqual({
      type: "compact",
      maxOutputTokens: undefined,
      continueMessage: "-t should be treated as message content",
    });
  });

  it("does not parse lines after newline as flags with existing flag", () => {
    const result = parseCommand("/compact -t 5000\n-c this is not a flag");
    expect(result).toEqual({
      type: "compact",
      maxOutputTokens: 5000,
      continueMessage: "-c this is not a flag",
    });
  });
});
