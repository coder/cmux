import { describe, it, expect } from "bun:test";
import type * as fs from "fs";
import { validatePathInCwd, validateFileSize, MAX_FILE_SIZE } from "./fileCommon";

describe("fileCommon", () => {
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
