/* eslint-disable local/no-sync-fs-methods -- Test file uses sync fs for simplicity */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { discoverExtensions } from "./discovery";

describe("discoverExtensions", () => {
  let tempDir: string;
  let projectPath: string;

  beforeEach(() => {
    // Create a temporary project directory
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cmux-ext-test-"));
    projectPath = path.join(tempDir, "project");
    fs.mkdirSync(projectPath, { recursive: true });
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("should return empty array when no extension directories exist", async () => {
    const extDir = path.join(projectPath, ".cmux", "ext");
    const extensions = await discoverExtensions(extDir);
    expect(extensions).toEqual([]);
  });

  test("should discover single-file .js extension", async () => {
    const extDir = path.join(projectPath, ".cmux", "ext");
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(path.join(extDir, "my-extension.js"), "export default { onPostToolUse() {} }");

    const extensions = await discoverExtensions(extDir);
    expect(extensions).toHaveLength(1);
    expect(extensions[0]).toMatchObject({
      id: "my-extension",
      type: "file",
    });
    expect(extensions[0].path).toContain("my-extension.js");
  });

  test("should discover folder extension with manifest.json", async () => {
    const extDir = path.join(projectPath, ".cmux", "ext", "my-folder-ext");
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(
      path.join(extDir, "manifest.json"),
      JSON.stringify({ entrypoint: "index.js" })
    );
    fs.writeFileSync(path.join(extDir, "index.js"), "export default { onPostToolUse() {} }");

    const extensions = await discoverExtensions(path.join(projectPath, ".cmux", "ext"));
    expect(extensions).toHaveLength(1);
    expect(extensions[0]).toMatchObject({
      id: "my-folder-ext",
      type: "folder",
      entrypoint: "index.js",
    });
    expect(extensions[0].path).toContain("index.js");
  });

  test("should skip folder without manifest.json", async () => {
    const extDir = path.join(projectPath, ".cmux", "ext", "no-manifest");
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(path.join(extDir, "index.js"), "export default { onPostToolUse() {} }");

    const extensions = await discoverExtensions(path.join(projectPath, ".cmux", "ext"));

    expect(extensions).toHaveLength(0);
  });

  test("should skip folder with manifest missing entrypoint field", async () => {
    const extDir = path.join(projectPath, ".cmux", "ext", "bad-manifest");
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(path.join(extDir, "manifest.json"), JSON.stringify({}));
    fs.writeFileSync(path.join(extDir, "index.js"), "export default { onPostToolUse() {} }");

    const extensions = await discoverExtensions(path.join(projectPath, ".cmux", "ext"));

    expect(extensions).toHaveLength(0);
  });

  test("should skip folder when entrypoint file does not exist", async () => {
    const extDir = path.join(projectPath, ".cmux", "ext", "missing-entry");
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(
      path.join(extDir, "manifest.json"),
      JSON.stringify({ entrypoint: "nonexistent.js" })
    );

    const extensions = await discoverExtensions(path.join(projectPath, ".cmux", "ext"));

    expect(extensions).toHaveLength(0);
  });

  test("should skip folder with invalid JSON manifest", async () => {
    const extDir = path.join(projectPath, ".cmux", "ext", "invalid-json");
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(path.join(extDir, "manifest.json"), "{ invalid json }");

    const extensions = await discoverExtensions(path.join(projectPath, ".cmux", "ext"));

    expect(extensions).toHaveLength(0);
  });

  test("should discover multiple extensions", async () => {
    const extDir = path.join(projectPath, ".cmux", "ext");
    fs.mkdirSync(extDir, { recursive: true });

    // Single file extension
    fs.writeFileSync(path.join(extDir, "ext1.js"), "export default { onPostToolUse() {} }");

    // Folder extension
    const folderExt = path.join(extDir, "ext2");
    fs.mkdirSync(folderExt);
    fs.writeFileSync(
      path.join(folderExt, "manifest.json"),
      JSON.stringify({ entrypoint: "main.js" })
    );
    fs.writeFileSync(path.join(folderExt, "main.js"), "export default { onPostToolUse() {} }");

    const extensions = await discoverExtensions(path.join(projectPath, ".cmux", "ext"));

    expect(extensions).toHaveLength(2);
  });

  test("should ignore non-.js files", async () => {
    const extDir = path.join(projectPath, ".cmux", "ext");
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(path.join(extDir, "README.md"), "# Readme");
    fs.writeFileSync(path.join(extDir, "config.json"), "{}");

    const extensions = await discoverExtensions(path.join(projectPath, ".cmux", "ext"));

    expect(extensions).toHaveLength(0);
  });
});
