import { describe, expect, it } from "bun:test";
import { SSHRuntime } from "./SSHRuntime";

describe("SSHRuntime constructor", () => {
  it("should reject tilde in srcBaseDir", () => {
    expect(() => {
      new SSHRuntime({
        host: "example.com",
        srcBaseDir: "~/cmux",
      });
    }).toThrow(/cannot start with tilde/);
  });

  it("should reject bare tilde in srcBaseDir", () => {
    expect(() => {
      new SSHRuntime({
        host: "example.com",
        srcBaseDir: "~",
      });
    }).toThrow(/cannot start with tilde/);
  });

  it("should accept absolute paths in srcBaseDir", () => {
    expect(() => {
      new SSHRuntime({
        host: "example.com",
        srcBaseDir: "/home/user/cmux",
      });
    }).not.toThrow();
  });
});
