/**
 * Tests for git diff parsing using a real git repository
 * IMPORTANT: Uses actual git commands, not simulated diffs
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";
import { parseDiff, extractAllHunks } from "./diffParser";
import { buildGitDiffCommand } from "@/components/RightSidebar/CodeReview/ReviewPanel";

describe("git diff parser (real repository)", () => {
  let testRepoPath: string;

  beforeAll(() => {
    // Create a temporary directory for our test repo
    testRepoPath = mkdtempSync(join(tmpdir(), "git-diff-test-"));

    // Initialize git repo
    execSync("git init", { cwd: testRepoPath });
    execSync('git config user.email "test@example.com"', { cwd: testRepoPath });
    execSync('git config user.name "Test User"', { cwd: testRepoPath });

    // Create initial commit with a file
    writeFileSync(join(testRepoPath, "file1.txt"), "Line 1\nLine 2\nLine 3\nLine 4\nLine 5\n");
    writeFileSync(
      join(testRepoPath, "file2.js"),
      'function hello() {\n  console.log("Hello");\n}\n'
    );
    execSync("git add .", { cwd: testRepoPath });
    execSync('git commit -m "Initial commit"', { cwd: testRepoPath });
  });

  afterAll(() => {
    // Clean up test repo
    rmSync(testRepoPath, { recursive: true, force: true });
  });

  it("should parse single file modification", () => {
    // Modify file1.txt
    writeFileSync(
      join(testRepoPath, "file1.txt"),
      "Line 1\nLine 2 modified\nLine 3\nLine 4\nLine 5\n"
    );

    // Get git diff
    const diff = execSync("git diff HEAD", { cwd: testRepoPath, encoding: "utf-8" });

    // Parse diff
    const fileDiffs = parseDiff(diff);

    expect(fileDiffs.length).toBe(1);
    expect(fileDiffs[0].filePath).toBe("file1.txt");
    expect(fileDiffs[0].hunks.length).toBeGreaterThan(0);

    const allHunks = extractAllHunks(fileDiffs);
    expect(allHunks.length).toBeGreaterThan(0);
    expect(allHunks[0].filePath).toBe("file1.txt");
    expect(allHunks[0].content.includes("modified")).toBe(true);
  });

  it("should parse multiple file modifications", () => {
    // Modify both files
    writeFileSync(
      join(testRepoPath, "file1.txt"),
      "Line 1\nNew line\nLine 2\nLine 3\nLine 4\nLine 5\n"
    );
    writeFileSync(
      join(testRepoPath, "file2.js"),
      'function hello() {\n  console.log("Hello World");\n  return true;\n}\n'
    );

    const diff = execSync("git diff HEAD", { cwd: testRepoPath, encoding: "utf-8" });
    const fileDiffs = parseDiff(diff);

    expect(fileDiffs.length).toBe(2);

    const file1Diff = fileDiffs.find((f) => f.filePath === "file1.txt");
    const file2Diff = fileDiffs.find((f) => f.filePath === "file2.js");

    expect(file1Diff).toBeDefined();
    expect(file2Diff).toBeDefined();

    const allHunks = extractAllHunks(fileDiffs);
    expect(allHunks.length).toBeGreaterThan(1);
  });

  it("should parse new file addition", () => {
    // Reset working directory
    execSync("git reset --hard HEAD", { cwd: testRepoPath });

    // Add new file
    writeFileSync(join(testRepoPath, "newfile.md"), "# New File\n\nContent here\n");
    execSync("git add newfile.md", { cwd: testRepoPath });

    const diff = execSync("git diff --cached", { cwd: testRepoPath, encoding: "utf-8" });
    const fileDiffs = parseDiff(diff);

    expect(fileDiffs.length).toBe(1);
    expect(fileDiffs[0].filePath).toBe("newfile.md");
    expect(fileDiffs[0].hunks.length).toBeGreaterThan(0);

    const allHunks = extractAllHunks(fileDiffs);
    // Check that all lines start with + (additions)
    const contentLines = allHunks[0].content.split("\n");
    expect(contentLines.some((l) => l.startsWith("+"))).toBe(true);
  });

  it("should parse file deletion", () => {
    // Reset and commit newfile
    execSync("git add . && git commit -m 'Add newfile'", { cwd: testRepoPath });

    // Delete file
    execSync("rm newfile.md", { cwd: testRepoPath });

    const diff = execSync("git diff HEAD", { cwd: testRepoPath, encoding: "utf-8" });
    const fileDiffs = parseDiff(diff);

    expect(fileDiffs.length).toBe(1);
    expect(fileDiffs[0].filePath).toBe("newfile.md");

    const allHunks = extractAllHunks(fileDiffs);
    // Check that all content lines start with - (deletions)
    const contentLines = allHunks[0].content.split("\n");
    expect(contentLines.some((l) => l.startsWith("-"))).toBe(true);
  });

  it("should parse branch comparison (three-dot diff)", () => {
    // Reset
    execSync("git reset --hard HEAD", { cwd: testRepoPath });

    // Create a feature branch
    execSync("git checkout -b feature", { cwd: testRepoPath });

    // Make changes on feature branch
    writeFileSync(join(testRepoPath, "feature.txt"), "Feature content\n");
    execSync("git add . && git commit -m 'Add feature'", { cwd: testRepoPath });

    // Get diff between main (or master) and feature
    // Note: mainBranch is determined by the initial setup
    const _mainBranch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: testRepoPath,
      encoding: "utf-8",
    }).trim();

    // Checkout main and compare
    execSync("git checkout -", { cwd: testRepoPath });
    const baseBranch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: testRepoPath,
      encoding: "utf-8",
    }).trim();

    const diff = execSync(`git diff ${baseBranch}...feature`, {
      cwd: testRepoPath,
      encoding: "utf-8",
    });

    const fileDiffs = parseDiff(diff);
    expect(fileDiffs.length).toBeGreaterThan(0);

    const featureFile = fileDiffs.find((f) => f.filePath === "feature.txt");
    expect(featureFile).toBeDefined();
  });

  it("should handle empty diff", () => {
    // Reset to clean state
    execSync("git reset --hard HEAD", { cwd: testRepoPath });

    const diff = execSync("git diff HEAD", { cwd: testRepoPath, encoding: "utf-8" });
    const fileDiffs = parseDiff(diff);

    expect(fileDiffs.length).toBe(0);

    const allHunks = extractAllHunks(fileDiffs);
    expect(allHunks.length).toBe(0);
  });

  it("should generate stable hunk IDs for same content", () => {
    // Reset
    execSync("git reset --hard HEAD", { cwd: testRepoPath });

    // Make a specific change
    writeFileSync(
      join(testRepoPath, "file1.txt"),
      "Line 1\nStable change\nLine 3\nLine 4\nLine 5\n"
    );

    const diff1 = execSync("git diff HEAD", { cwd: testRepoPath, encoding: "utf-8" });
    const hunks1 = extractAllHunks(parseDiff(diff1));
    const id1 = hunks1[0]?.id;

    // Reset and make the SAME change again
    execSync("git reset --hard HEAD", { cwd: testRepoPath });
    writeFileSync(
      join(testRepoPath, "file1.txt"),
      "Line 1\nStable change\nLine 3\nLine 4\nLine 5\n"
    );

    const diff2 = execSync("git diff HEAD", { cwd: testRepoPath, encoding: "utf-8" });
    const hunks2 = extractAllHunks(parseDiff(diff2));
    const id2 = hunks2[0]?.id;

    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).toBe(id2);
  });

  it("should handle large diffs with many hunks", () => {
    // Reset
    execSync("git reset --hard HEAD", { cwd: testRepoPath });

    // Create a file with many lines
    const lines = Array.from({ length: 100 }, (_, i) => `Line ${i + 1}`);
    writeFileSync(join(testRepoPath, "large.txt"), lines.join("\n") + "\n");
    execSync("git add . && git commit -m 'Add large file'", { cwd: testRepoPath });

    // Modify multiple sections
    const modifiedLines = lines.map((line, i) => {
      if (i % 20 === 0) return `Modified ${line}`;
      return line;
    });
    writeFileSync(join(testRepoPath, "large.txt"), modifiedLines.join("\n") + "\n");

    const diff = execSync("git diff HEAD", { cwd: testRepoPath, encoding: "utf-8" });
    const fileDiffs = parseDiff(diff);

    expect(fileDiffs.length).toBe(1);
    expect(fileDiffs[0].hunks.length).toBeGreaterThan(1);

    const allHunks = extractAllHunks(fileDiffs);
    expect(allHunks.length).toBeGreaterThan(1);

    // All hunks should have valid IDs
    expect(allHunks.every((h) => h.id && h.id.length > 0)).toBe(true);
  });

  it("should handle pure file rename (no content changes)", () => {
    // Reset
    execSync("git reset --hard HEAD", { cwd: testRepoPath });

    // Rename a file with git mv (preserves history)
    execSync("git mv file1.txt file1-renamed.txt", { cwd: testRepoPath });

    // Use -M flag to detect renames (though pure renames are detected by default)
    const diff = execSync("git diff --cached -M", { cwd: testRepoPath, encoding: "utf-8" });
    const fileDiffs = parseDiff(diff);

    // A pure rename should be detected
    expect(fileDiffs.length).toBe(1);
    expect(fileDiffs[0].filePath).toBe("file1-renamed.txt");
    expect(fileDiffs[0].oldPath).toBe("file1.txt");
    expect(fileDiffs[0].changeType).toBe("renamed");

    const allHunks = extractAllHunks(fileDiffs);

    // Pure renames with no content changes should have NO hunks
    // because git shows "similarity index 100%" with no diff content
    expect(allHunks.length).toBe(0);
  });

  it("should handle file rename with content changes", () => {
    // Reset
    execSync("git reset --hard HEAD", { cwd: testRepoPath });

    // Create a larger file so a small change maintains high similarity
    writeFileSync(
      join(testRepoPath, "large-file.js"),
      `// Header comment
function hello() {
  console.log("Hello");
}

function goodbye() {
  console.log("Goodbye");
}

function greet(name) {
  console.log(\`Hello \${name}\`);
}

// Footer comment
`
    );
    execSync("git add . && git commit -m 'Add large file'", { cwd: testRepoPath });

    // Rename and make a small modification (maintains >50% similarity)
    execSync("git mv large-file.js renamed-file.js", { cwd: testRepoPath });
    writeFileSync(
      join(testRepoPath, "renamed-file.js"),
      `// Header comment
function hello() {
  console.log("Hello World"); // MODIFIED
}

function goodbye() {
  console.log("Goodbye");
}

function greet(name) {
  console.log(\`Hello \${name}\`);
}

// Footer comment
`
    );
    execSync("git add renamed-file.js", { cwd: testRepoPath });

    // Use -M flag to detect renames
    const diff = execSync("git diff --cached -M", { cwd: testRepoPath, encoding: "utf-8" });
    const fileDiffs = parseDiff(diff);

    expect(fileDiffs.length).toBe(1);
    expect(fileDiffs[0].filePath).toBe("renamed-file.js");
    expect(fileDiffs[0].oldPath).toBe("large-file.js");
    expect(fileDiffs[0].changeType).toBe("renamed");

    const allHunks = extractAllHunks(fileDiffs);
    expect(allHunks.length).toBeGreaterThan(0);

    // Hunks should show the content changes
    expect(allHunks[0].changeType).toBe("renamed");
    expect(allHunks[0].oldPath).toBe("large-file.js");
    expect(allHunks[0].content.includes("World")).toBe(true);
  });

  it("should handle renamed directory with files", () => {
    // Reset and setup
    execSync("git reset --hard HEAD", { cwd: testRepoPath });

    // Create a directory structure
    execSync("mkdir -p old-dir", { cwd: testRepoPath });
    writeFileSync(join(testRepoPath, "old-dir", "nested1.txt"), "Nested file 1\n");
    writeFileSync(join(testRepoPath, "old-dir", "nested2.txt"), "Nested file 2\n");
    execSync("git add . && git commit -m 'Add nested files'", { cwd: testRepoPath });

    // Rename the directory
    execSync("git mv old-dir new-dir", { cwd: testRepoPath });

    // Use -M flag to detect renames
    const diff = execSync("git diff --cached -M", { cwd: testRepoPath, encoding: "utf-8" });
    const fileDiffs = parseDiff(diff);

    // Should detect renames for all files in the directory
    expect(fileDiffs.length).toBeGreaterThanOrEqual(2);

    const nested1 = fileDiffs.find((f) => f.filePath === "new-dir/nested1.txt");
    const nested2 = fileDiffs.find((f) => f.filePath === "new-dir/nested2.txt");

    expect(nested1).toBeDefined();
    expect(nested2).toBeDefined();

    if (nested1) {
      expect(nested1.changeType).toBe("renamed");
      expect(nested1.oldPath).toBe("old-dir/nested1.txt");
    }

    if (nested2) {
      expect(nested2.changeType).toBe("renamed");
      expect(nested2.oldPath).toBe("old-dir/nested2.txt");
    }

    const allHunks = extractAllHunks(fileDiffs);

    // Pure directory renames should have NO hunks (files are identical)
    expect(allHunks.length).toBe(0);
  });

  it("should show unified diff when includeUncommitted is true", () => {
    // Verify includeUncommitted produces single unified diff (not separate committed + uncommitted)
    execSync("git reset --hard HEAD", { cwd: testRepoPath });

    const baseBranch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: testRepoPath,
      encoding: "utf-8",
    }).trim();

    execSync("git checkout -b unified-test", { cwd: testRepoPath });

    // Commit a change, then make uncommitted change
    writeFileSync(join(testRepoPath, "test-file.txt"), "Line 1\nLine 2\nLine 3\n");
    execSync("git add test-file.txt && git commit -m 'Add test file'", { cwd: testRepoPath });
    writeFileSync(join(testRepoPath, "test-file.txt"), "Line 1\nLine 2\nLine 3 modified\nLine 4\n");

    const gitCommand = buildGitDiffCommand(baseBranch, true, "", "diff");
    const diffOutput = execSync(gitCommand, { cwd: testRepoPath, encoding: "utf-8" });
    const fileDiffs = parseDiff(diffOutput);

    // Single FileDiff with unified changes (no duplicates)
    expect(fileDiffs.length).toBe(1);
    expect(fileDiffs[0].filePath).toBe("test-file.txt");

    const allHunks = extractAllHunks(fileDiffs);
    const allContent = allHunks.map((h) => h.content).join("\n");
    expect(allContent.includes("Line 3 modified") || allContent.includes("Line 4")).toBe(true);

    execSync("git reset --hard HEAD && git checkout -", { cwd: testRepoPath });
  });

  it("should exclude uncommitted changes when includeUncommitted is false", () => {
    // Verify includeUncommitted=false uses three-dot (committed only)
    execSync("git reset --hard HEAD", { cwd: testRepoPath });

    const baseBranch = execSync("git rev-parse --abbrev-ref HEAD", {
      cwd: testRepoPath,
      encoding: "utf-8",
    }).trim();

    execSync("git checkout -b committed-only-test", { cwd: testRepoPath });

    // Commit a change
    writeFileSync(join(testRepoPath, "committed-file.txt"), "Line 1\nLine 2\n");
    execSync("git add committed-file.txt && git commit -m 'Add committed file'", {
      cwd: testRepoPath,
    });

    // Make uncommitted change (should NOT appear in diff)
    writeFileSync(join(testRepoPath, "committed-file.txt"), "Line 1\nLine 2\nUncommitted line\n");

    const gitCommand = buildGitDiffCommand(baseBranch, false, "", "diff");
    const diffOutput = execSync(gitCommand, { cwd: testRepoPath, encoding: "utf-8" });
    const fileDiffs = parseDiff(diffOutput);

    // Should get FileDiff showing only committed changes
    expect(fileDiffs.length).toBe(1);
    expect(fileDiffs[0].filePath).toBe("committed-file.txt");

    const allHunks = extractAllHunks(fileDiffs);
    const allContent = allHunks.map((h) => h.content).join("\n");

    // Should NOT include uncommitted "Uncommitted line"
    expect(allContent.includes("Uncommitted line")).toBe(false);
    // Should include committed content
    expect(allContent.includes("Line 1") || allContent.includes("Line 2")).toBe(true);

    execSync("git reset --hard HEAD && git checkout -", { cwd: testRepoPath });
  });

  it("should handle staged + uncommitted when diffBase is --staged", () => {
    // Verify --staged with includeUncommitted produces TWO diffs (staged + unstaged)
    execSync("git reset --hard HEAD", { cwd: testRepoPath });

    writeFileSync(join(testRepoPath, "staged-test.txt"), "Line 1\nLine 2\nLine 3\n");
    execSync("git add staged-test.txt", { cwd: testRepoPath });

    writeFileSync(join(testRepoPath, "staged-test.txt"), "Line 1\nLine 2 staged\nLine 3\n");
    execSync("git add staged-test.txt", { cwd: testRepoPath });

    writeFileSync(
      join(testRepoPath, "staged-test.txt"),
      "Line 1\nLine 2 staged\nLine 3 unstaged\n"
    );

    const gitCommand = buildGitDiffCommand("--staged", true, "", "diff");
    const diffOutput = execSync(gitCommand, { cwd: testRepoPath, encoding: "utf-8" });
    const fileDiffs = parseDiff(diffOutput);

    // Two FileDiff entries (staged + unstaged)
    expect(fileDiffs.length).toBe(2);
    expect(fileDiffs.every((f) => f.filePath === "staged-test.txt")).toBe(true);

    const allHunks = extractAllHunks(fileDiffs);
    expect(allHunks.length).toBe(2);

    const allContent = allHunks.map((h) => h.content).join("\n");
    expect(allContent.includes("staged")).toBe(true);
    expect(allContent.includes("unstaged")).toBe(true);
  });

  it("should not show inverse deltas when branch is behind base ref", () => {
    // Scenario: Branch A is 3 commits behind origin/main
    //
    // Git history:
    //   test-main:  Initial---Y---Z---W (3 commits ahead)
    //                 \
    //   feature:       Feature (committed) + uncommitted changes
    //
    // Problem: Old behavior with includeUncommitted=true used two-dot diff,
    // comparing W to working directory, showing Y, Z, W as inverse deltas.
    //
    // Expected: Should only show feature branch changes (committed + uncommitted),
    // NOT inverse deltas from Y, Z, W commits that landed on test-main.
    execSync("git reset --hard HEAD", { cwd: testRepoPath });

    // Create a "main" branch and add 3 commits
    execSync("git checkout -b test-main", { cwd: testRepoPath });
    writeFileSync(join(testRepoPath, "main-file.txt"), "Initial content\n");
    execSync("git add main-file.txt && git commit -m 'Initial on main'", { cwd: testRepoPath });

    // Branch off from here (this is the merge-base)
    execSync("git checkout -b feature-branch", { cwd: testRepoPath });

    // Add commits on feature branch
    writeFileSync(join(testRepoPath, "feature-file.txt"), "Feature content\n");
    execSync("git add feature-file.txt && git commit -m 'Add feature file'", {
      cwd: testRepoPath,
    });

    // Simulate origin/main moving forward (3 commits ahead)
    execSync("git checkout test-main", { cwd: testRepoPath });
    writeFileSync(join(testRepoPath, "main-file.txt"), "Initial content\nCommit Y\n");
    execSync("git add main-file.txt && git commit -m 'Commit Y on main'", {
      cwd: testRepoPath,
    });

    writeFileSync(join(testRepoPath, "main-file.txt"), "Initial content\nCommit Y\nCommit Z\n");
    execSync("git add main-file.txt && git commit -m 'Commit Z on main'", {
      cwd: testRepoPath,
    });

    writeFileSync(join(testRepoPath, "main-file.txt"), "Initial content\nCommit Y\nCommit Z\nCommit W\n");
    execSync("git add main-file.txt && git commit -m 'Commit W on main'", {
      cwd: testRepoPath,
    });

    // Back to feature branch
    execSync("git checkout feature-branch", { cwd: testRepoPath });

    // Add uncommitted changes to feature branch
    writeFileSync(join(testRepoPath, "feature-file.txt"), "Feature content\nUncommitted change\n");

    // Now review with includeUncommitted=true, base=test-main
    const gitCommand = buildGitDiffCommand("test-main", true, "", "diff");
    const diffOutput = execSync(gitCommand, { cwd: testRepoPath, encoding: "utf-8" });
    const fileDiffs = parseDiff(diffOutput);

    // Should show only feature-file.txt (the file we added/modified)
    // Should NOT show main-file.txt as deletions (inverse deltas)
    const featureFile = fileDiffs.find((f) => f.filePath === "feature-file.txt");
    const mainFile = fileDiffs.find((f) => f.filePath === "main-file.txt");

    expect(featureFile).toBeDefined();
    expect(mainFile).toBeUndefined(); // Should NOT appear

    // Verify we see both committed and uncommitted changes in feature-file.txt
    const allHunks = extractAllHunks(fileDiffs);
    const allContent = allHunks.map((h) => h.content).join("\n");

    expect(allContent.includes("Feature content")).toBe(true);
    expect(allContent.includes("Uncommitted change")).toBe(true);

    // Critically: should NOT show any deletions from Commit Y, Z, W
    expect(allContent.includes("Commit Y")).toBe(false);
    expect(allContent.includes("Commit Z")).toBe(false);
    expect(allContent.includes("Commit W")).toBe(false);

    // Cleanup
    execSync("git checkout test-main --force", { cwd: testRepoPath });
    execSync("git branch -D feature-branch", { cwd: testRepoPath });
  });
});
