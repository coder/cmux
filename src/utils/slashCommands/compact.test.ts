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
