import { describe, it, expect } from "bun:test";
import type * as fs from "fs";
import { leaseFromContent, validatePathInCwd, validateFileSize, MAX_FILE_SIZE } from "./fileCommon";

describe("fileCommon", () => {
  describe("leaseFromContent", () => {
    it("should return a 6-character hexadecimal string", () => {
      const content = "Hello, world!";
      const lease = leaseFromContent(content);

      expect(lease).toMatch(/^[0-9a-f]{6}$/);
      expect(lease.length).toBe(6);
    });

    it("should be deterministic for same content", () => {
      const content = "Hello, world!";
      const lease1 = leaseFromContent(content);
      const lease2 = leaseFromContent(content);

      expect(lease1).toBe(lease2);
    });

    it("should produce different leases for different content", () => {
      const content1 = "Hello, world!";
      const content2 = "Hello, world!!";

      const lease1 = leaseFromContent(content1);
      const lease2 = leaseFromContent(content2);

      expect(lease1).not.toBe(lease2);
    });

    it("should work with Buffer input", () => {
      const buffer = Buffer.from("Hello, world!", "utf-8");
      const lease = leaseFromContent(buffer);

      expect(lease).toMatch(/^[0-9a-f]{6}$/);
      expect(lease.length).toBe(6);
    });

    it("should produce same lease for string and equivalent Buffer", () => {
      const content = "Hello, world!";
      const buffer = Buffer.from(content, "utf-8");

      const lease1 = leaseFromContent(content);
      const lease2 = leaseFromContent(buffer);

      expect(lease1).toBe(lease2);
    });

    it("should produce different leases for empty vs non-empty content", () => {
      const lease1 = leaseFromContent("");
      const lease2 = leaseFromContent("a");

      expect(lease1).not.toBe(lease2);
    });

    it("should produce identical lease for same content regardless of external factors", () => {
      // This test verifies that content-based leases are immune to mtime changes
      // that could be triggered by external processes (e.g., IDE, git, filesystem tools)
      const content = "const x = 42;\n";
      const lease1 = leaseFromContent(content);

      // Simulate same content but different metadata (like mtime)
      // In the old mtime-based system, this would produce a different lease
      // With content-based leases, it produces the same lease
      const lease2 = leaseFromContent(content);

      expect(lease1).toBe(lease2);
    });
  });

  describe("validateFileSize", () => {
    it("should return null for files within size limit", () => {
      const stats = {
        size: 1024, // 1KB
      } satisfies Partial<fs.Stats> as fs.Stats;

      expect(validateFileSize(stats)).toBeNull();
    });

    it("should return null for files at exactly the limit", () => {
      const stats = {
        size: MAX_FILE_SIZE,
      } satisfies Partial<fs.Stats> as fs.Stats;

      expect(validateFileSize(stats)).toBeNull();
    });

    it("should return error for files exceeding size limit", () => {
      const stats = {
        size: MAX_FILE_SIZE + 1,
      } satisfies Partial<fs.Stats> as fs.Stats;

      const result = validateFileSize(stats);
      expect(result).not.toBeNull();
      expect(result?.error).toContain("too large");
      expect(result?.error).toContain("system tools");
    });

    it("should include size information in error message", () => {
      const stats = {
        size: MAX_FILE_SIZE * 2, // 2MB
      } satisfies Partial<fs.Stats> as fs.Stats;

      const result = validateFileSize(stats);
      expect(result?.error).toContain("2.00MB");
      expect(result?.error).toContain("1.00MB");
    });

    it("should suggest alternative tools in error message", () => {
      const stats = {
        size: MAX_FILE_SIZE + 1,
      } satisfies Partial<fs.Stats> as fs.Stats;

      const result = validateFileSize(stats);
      expect(result?.error).toContain("grep");
      expect(result?.error).toContain("sed");
    });
  });

  describe("validatePathInCwd", () => {
    const cwd = "/workspace/project";

    it("should allow relative paths within cwd", () => {
      expect(validatePathInCwd("src/file.ts", cwd)).toBeNull();
      expect(validatePathInCwd("./src/file.ts", cwd)).toBeNull();
      expect(validatePathInCwd("file.ts", cwd)).toBeNull();
    });

    it("should allow absolute paths within cwd", () => {
      expect(validatePathInCwd("/workspace/project/src/file.ts", cwd)).toBeNull();
      expect(validatePathInCwd("/workspace/project/file.ts", cwd)).toBeNull();
    });

    it("should reject paths that go up and outside cwd with ..", () => {
      const result = validatePathInCwd("../outside.ts", cwd);
      expect(result).not.toBeNull();
      expect(result?.error).toContain("restricted to the workspace directory");
      expect(result?.error).toContain("/workspace/project");
    });

    it("should reject paths that go multiple levels up", () => {
      const result = validatePathInCwd("../../outside.ts", cwd);
      expect(result).not.toBeNull();
      expect(result?.error).toContain("restricted to the workspace directory");
    });

    it("should reject paths that go down then up outside cwd", () => {
      const result = validatePathInCwd("src/../../outside.ts", cwd);
      expect(result).not.toBeNull();
      expect(result?.error).toContain("restricted to the workspace directory");
    });

    it("should reject absolute paths outside cwd", () => {
      const result = validatePathInCwd("/etc/passwd", cwd);
      expect(result).not.toBeNull();
      expect(result?.error).toContain("restricted to the workspace directory");
    });

    it("should reject absolute paths in different directory tree", () => {
      const result = validatePathInCwd("/home/user/file.ts", cwd);
      expect(result).not.toBeNull();
      expect(result?.error).toContain("restricted to the workspace directory");
    });

    it("should handle paths with trailing slashes", () => {
      expect(validatePathInCwd("src/", cwd)).toBeNull();
    });

    it("should handle nested paths correctly", () => {
      expect(validatePathInCwd("src/components/Button/index.ts", cwd)).toBeNull();
      expect(validatePathInCwd("./src/components/Button/index.ts", cwd)).toBeNull();
    });

    it("should provide helpful error message mentioning to ask user", () => {
      const result = validatePathInCwd("../outside.ts", cwd);
      expect(result?.error).toContain("ask the user for permission");
    });

    it("should work with cwd that has trailing slash", () => {
      const cwdWithSlash = "/workspace/project/";
      expect(validatePathInCwd("src/file.ts", cwdWithSlash)).toBeNull();

      const result = validatePathInCwd("../outside.ts", cwdWithSlash);
      expect(result).not.toBeNull();
    });
  });
});
