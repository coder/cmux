import { describe, expect, it } from "bun:test";
import { SSHRuntime } from "./SSHRuntime";

describe("SSHRuntime constructor", () => {
  it("should accept tilde in srcBaseDir", () => {
    // Tildes are now allowed - they will be resolved via resolvePath()
    expect(() => {
      new SSHRuntime({
        host: "example.com",
        srcBaseDir: "~/cmux",
      });
    }).not.toThrow();
  });

  it("should accept bare tilde in srcBaseDir", () => {
    // Tildes are now allowed - they will be resolved via resolvePath()
    expect(() => {
      new SSHRuntime({
        host: "example.com",
        srcBaseDir: "~",
      });
    }).not.toThrow();
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

describe("SSHRuntime.resolvePath", () => {
  // Note: These tests require TEST_INTEGRATION=1 to run with actual SSH connection
  const isIntegrationTest = process.env.TEST_INTEGRATION === "1";
  const describeIfIntegration = isIntegrationTest ? describe : describe.skip;

  describeIfIntegration("with SSH connection", () => {
    it("should expand tilde to home directory", async () => {
      const runtime = new SSHRuntime({
        host: process.env.SSH_HOST ?? "localhost",
        port: parseInt(process.env.SSH_PORT ?? "2222"),
        identityFile: process.env.SSH_IDENTITY_FILE,
        srcBaseDir: "~/test-workspace",
      });

      const resolved = await runtime.resolvePath("~");
      // Should be an absolute path
      expect(resolved).toMatch(/^\/home\//);
    });

    it("should expand tilde with path", async () => {
      const runtime = new SSHRuntime({
        host: process.env.SSH_HOST ?? "localhost",
        port: parseInt(process.env.SSH_PORT ?? "2222"),
        identityFile: process.env.SSH_IDENTITY_FILE,
        srcBaseDir: "~/test-workspace",
      });

      const resolved = await runtime.resolvePath("~/..");
      // Should be parent of home directory
      expect(resolved).toBe("/home");
    });

    it("should resolve absolute paths", async () => {
      const runtime = new SSHRuntime({
        host: process.env.SSH_HOST ?? "localhost",
        port: parseInt(process.env.SSH_PORT ?? "2222"),
        identityFile: process.env.SSH_IDENTITY_FILE,
        srcBaseDir: "/tmp",
      });

      const resolved = await runtime.resolvePath("/tmp");
      expect(resolved).toBe("/tmp");
    });

    it("should reject non-existent paths", async () => {
      const runtime = new SSHRuntime({
        host: process.env.SSH_HOST ?? "localhost",
        port: parseInt(process.env.SSH_PORT ?? "2222"),
        identityFile: process.env.SSH_IDENTITY_FILE,
        srcBaseDir: "/tmp",
      });

      // eslint-disable-next-line @typescript-eslint/await-thenable
      await expect(runtime.resolvePath("/this/path/does/not/exist/12345")).rejects.toThrow(
        /Failed to resolve path/
      );
    });
  });
});
