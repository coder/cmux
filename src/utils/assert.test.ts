import { describe, expect, test } from "bun:test";
import { assert } from "./assert";

describe("assert", () => {
  test("should not throw when condition is truthy", () => {
    expect(() => assert(true)).not.toThrow();
    expect(() => assert(1)).not.toThrow();
    expect(() => assert("non-empty")).not.toThrow();
    expect(() => assert({})).not.toThrow();
    expect(() => assert([])).not.toThrow();
  });

  test("should throw with default message when condition is falsy", () => {
    expect(() => assert(false)).toThrow("Assertion failed");
    expect(() => assert(0)).toThrow("Assertion failed");
    expect(() => assert("")).toThrow("Assertion failed");
    expect(() => assert(null)).toThrow("Assertion failed");
    expect(() => assert(undefined)).toThrow("Assertion failed");
  });

  test("should throw with custom message when provided", () => {
    expect(() => assert(false, "Custom error")).toThrow("Custom error");
    expect(() => assert(null, "Value should not be null")).toThrow("Value should not be null");
  });

  test("should narrow types correctly", () => {
    // This test verifies TypeScript's type narrowing works
    const value: string | null = Math.random() > -1 ? "test" : null;

    assert(value !== null, "Value should not be null");

    // After assert, TypeScript should know value is string (not string | null)
    // This would be a compile error if type narrowing didn't work:
    const length: number = value.length;
    expect(length).toBe(4);
  });

  test("should work with complex conditions", () => {
    const obj = { prop: "value" };
    expect(() => assert(obj.prop === "value")).not.toThrow();
    expect(() => assert(obj.prop === "other", "Property mismatch")).toThrow("Property mismatch");
  });
});
