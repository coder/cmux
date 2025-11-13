import { describe, expect, test } from "bun:test";
import { sanitizeBranchNameForDirectory, detectDirectoryNameConflict } from "./directoryName";

describe("sanitizeBranchNameForDirectory", () => {
  test("converts single slash to dash", () => {
    expect(sanitizeBranchNameForDirectory("feature/foo")).toBe("feature-foo");
  });

  test("converts multiple slashes to dashes", () => {
    expect(sanitizeBranchNameForDirectory("feature/sub/foo")).toBe("feature-sub-foo");
  });

  test("handles deep hierarchies", () => {
    expect(sanitizeBranchNameForDirectory("feature/sub/sub2/foo")).toBe("feature-sub-sub2-foo");
  });

  test("handles multiple consecutive slashes", () => {
    expect(sanitizeBranchNameForDirectory("feature//foo")).toBe("feature--foo");
  });

  test("handles leading slash", () => {
    expect(sanitizeBranchNameForDirectory("/feature")).toBe("-feature");
  });

  test("handles trailing slash", () => {
    expect(sanitizeBranchNameForDirectory("feature/")).toBe("feature-");
  });

  test("handles leading and trailing slashes", () => {
    expect(sanitizeBranchNameForDirectory("/feature/foo/")).toBe("-feature-foo-");
  });

  test("passes through names without slashes unchanged", () => {
    expect(sanitizeBranchNameForDirectory("feature-foo")).toBe("feature-foo");
    expect(sanitizeBranchNameForDirectory("main")).toBe("main");
    expect(sanitizeBranchNameForDirectory("my_branch")).toBe("my_branch");
  });

  test("handles real-world examples", () => {
    expect(sanitizeBranchNameForDirectory("docs/bash-timeout-ux")).toBe("docs-bash-timeout-ux");
    expect(sanitizeBranchNameForDirectory("bugfix/issue-123")).toBe("bugfix-issue-123");
  });
});

describe("detectDirectoryNameConflict", () => {
  test("detects conflict between slash and dash versions", () => {
    const conflict = detectDirectoryNameConflict("feature/foo", ["feature-foo"]);
    expect(conflict).toBe("feature-foo");
  });

  test("detects conflict in opposite direction", () => {
    const conflict = detectDirectoryNameConflict("feature-foo", ["feature/foo"]);
    expect(conflict).toBe("feature/foo");
  });

  test("returns null when no conflict exists", () => {
    const conflict = detectDirectoryNameConflict("feature/foo", ["feature/bar", "bugfix/baz"]);
    expect(conflict).toBeNull();
  });

  test("allows same name (not a conflict with itself)", () => {
    const conflict = detectDirectoryNameConflict("feature/foo", ["feature/foo"]);
    expect(conflict).toBeNull();
  });

  test("detects complex hierarchy conflict", () => {
    const conflict = detectDirectoryNameConflict("docs/bash-timeout-ux", ["docs-bash-timeout-ux"]);
    expect(conflict).toBe("docs-bash-timeout-ux");
  });

  test("handles multiple existing workspaces", () => {
    const conflict = detectDirectoryNameConflict("feature/new", [
      "main",
      "feature-new",
      "bugfix/123",
    ]);
    expect(conflict).toBe("feature-new");
  });

  test("returns first conflict found", () => {
    const conflict = detectDirectoryNameConflict("a/b", ["a-b", "x-y"]);
    expect(conflict).toBe("a-b");
  });

  test("handles empty existing workspaces list", () => {
    const conflict = detectDirectoryNameConflict("feature/foo", []);
    expect(conflict).toBeNull();
  });
});
