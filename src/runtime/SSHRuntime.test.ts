import { describe, expect, test } from "@jest/globals";
import { buildEnvExports } from "./SSHRuntime";

describe("buildEnvExports", () => {
  test("returns empty string for undefined env", () => {
    expect(buildEnvExports(undefined)).toBe("");
  });

  test("returns empty string for empty env object", () => {
    expect(buildEnvExports({})).toBe("");
  });

  test("handles single simple variable", () => {
    const result = buildEnvExports({ TEST_VAR: "value" });
    expect(result).toBe("export TEST_VAR='value'; ");
  });

  test("handles multiple variables", () => {
    const result = buildEnvExports({
      VAR1: "value1",
      VAR2: "value2",
      VAR3: "value3",
    });
    expect(result).toBe("export VAR1='value1'; export VAR2='value2'; export VAR3='value3'; ");
  });

  test("preserves dollar signs (no escaping in single quotes)", () => {
    const result = buildEnvExports({ VAR: "value$with$dollars" });
    expect(result).toBe("export VAR='value$with$dollars'; ");
  });

  test("preserves double quotes (no escaping in single quotes)", () => {
    const result = buildEnvExports({ VAR: 'value"with"quotes' });
    expect(result).toBe("export VAR='value\"with\"quotes'; ");
  });

  test("preserves backslashes (no escaping in single quotes)", () => {
    const result = buildEnvExports({ VAR: "value\\with\\backslashes" });
    expect(result).toBe("export VAR='value\\with\\backslashes'; ");
  });

  test("preserves backticks (no escaping in single quotes)", () => {
    const result = buildEnvExports({ VAR: "value`with`backticks" });
    expect(result).toBe("export VAR='value`with`backticks'; ");
  });

  test("escapes single quotes using '\\''-escape pattern", () => {
    const result = buildEnvExports({ VAR: "can't" });
    expect(result).toBe("export VAR='can'\\''t'; ");
  });

  test("handles multiple single quotes", () => {
    const result = buildEnvExports({ VAR: "it's a 'test'" });
    expect(result).toBe("export VAR='it'\\''s a '\\''test'\\'''; ");
  });

  test("preserves all special characters except single quotes", () => {
    const result = buildEnvExports({
      VAR: 'complex$value"with\\all`special',
    });
    expect(result).toBe("export VAR='complex$value\"with\\all`special'; ");
  });

  test("handles empty string value", () => {
    const result = buildEnvExports({ EMPTY: "" });
    expect(result).toBe("export EMPTY=''; ");
  });

  test("handles spaces in values", () => {
    const result = buildEnvExports({ VAR: "value with spaces" });
    expect(result).toBe("export VAR='value with spaces'; ");
  });

  test("handles newlines in values", () => {
    const result = buildEnvExports({ VAR: "line1\nline2" });
    expect(result).toBe("export VAR='line1\nline2'; ");
  });

  test("handles tabs in values", () => {
    const result = buildEnvExports({ VAR: "tab\there" });
    expect(result).toBe("export VAR='tab\there'; ");
  });

  test("handles very long values", () => {
    const longValue = "x".repeat(1000);
    const result = buildEnvExports({ VAR: longValue });
    expect(result).toBe(`export VAR='${longValue}'; `);
  });

  test("handles special variable names", () => {
    const result = buildEnvExports({
      _VAR: "value",
      VAR_123: "value",
      VAR_WITH_UNDERSCORES: "value",
    });
    expect(result).toBe(
      "export _VAR='value'; export VAR_123='value'; export VAR_WITH_UNDERSCORES='value'; "
    );
  });

  test("preserves order of variables", () => {
    // Note: Object.entries() order is insertion order for string keys
    const result = buildEnvExports({ Z: "z", A: "a", M: "m" });
    expect(result).toBe("export Z='z'; export A='a'; export M='m'; ");
  });
});
