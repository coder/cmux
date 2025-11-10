import { test, expect, afterEach } from "bun:test";
import {
  compileExtension,
  clearCompilationCache,
  getCompilationCacheSize,
} from "./compiler";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const CACHE_DIR = path.join(os.homedir(), ".cmux", "ext-cache");

afterEach(async () => {
  // Clean up cache after each test
  await clearCompilationCache();
});

test.concurrent("should compile TypeScript extension with type imports", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cmux-ts-ext-"));

  try {
    const tsFile = path.join(tempDir, "test.ts");

    await fs.writeFile(
      tsFile,
      `
      import type { Extension, PostToolUseHookPayload } from '@coder/cmux/ext';
      
      const extension: Extension = {
        async onPostToolUse(payload: PostToolUseHookPayload) {
          const { toolName } = payload;
          console.log('Tool used:', toolName);
        }
      };
      
      export default extension;
    `
    );

    const jsPath = await compileExtension(tsFile);

    // Verify compiled file is in cache directory
    expect(jsPath).toContain(".cmux/ext-cache/");
    expect(jsPath).toMatch(/\.js$/);

    // Verify compiled file exists
    const exists = await fs
      .access(jsPath)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);

    // Verify compiled file is valid ES module
    const module = await import(jsPath);
    expect(module.default).toBeDefined();
    expect(typeof module.default.onPostToolUse).toBe("function");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test.concurrent("should use cache on second compilation", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cmux-ts-ext-"));

  try {
    const tsFile = path.join(tempDir, "test.ts");

    await fs.writeFile(
      tsFile,
      `
      import type { Extension } from '@coder/cmux/ext';
      const ext: Extension = { onPostToolUse: async () => {} };
      export default ext;
    `
    );

    // First compilation
    const jsPath1 = await compileExtension(tsFile);
    const stat1 = await fs.stat(jsPath1);

    // Wait a tiny bit to ensure mtime would differ if recompiled
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Second compilation should use cache
    const jsPath2 = await compileExtension(tsFile);
    const stat2 = await fs.stat(jsPath2);

    // Same path returned
    expect(jsPath1).toBe(jsPath2);

    // File not recompiled (same mtime)
    expect(stat1.mtime.getTime()).toBe(stat2.mtime.getTime());
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test.concurrent("should invalidate cache when file changes", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cmux-ts-ext-"));

  try {
    const tsFile = path.join(tempDir, "test.ts");

    await fs.writeFile(
      tsFile,
      `
      import type { Extension } from '@coder/cmux/ext';
      const ext: Extension = { onPostToolUse: async () => console.log('v1') };
      export default ext;
    `
    );

    // First compilation
    const jsPath1 = await compileExtension(tsFile);

    // Wait to ensure mtime changes
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Modify file
    await fs.writeFile(
      tsFile,
      `
      import type { Extension } from '@coder/cmux/ext';
      const ext: Extension = { onPostToolUse: async () => console.log('v2') };
      export default ext;
    `
    );

    // Second compilation should use different cache entry
    const jsPath2 = await compileExtension(tsFile);

    // Different cached file (hash changed)
    expect(jsPath1).not.toBe(jsPath2);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test.concurrent("should handle compilation errors gracefully", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cmux-ts-ext-"));

  try {
    const tsFile = path.join(tempDir, "broken.ts");

    await fs.writeFile(
      tsFile,
      `
      import type { Extension } from '@coder/cmux/ext';
      // Invalid TypeScript - missing semicolon, wrong types
      const ext: Extension = {
        onPostToolUse: async (payload: WrongType) => {
          this is not valid typescript syntax
        }
      };
      export default ext
    `
    );

    // Should throw error with context
    await expect(compileExtension(tsFile)).rejects.toThrow(/Failed to compile broken.ts/);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test.concurrent("should clear compilation cache", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cmux-ts-ext-"));

  try {
    const tsFile = path.join(tempDir, "test.ts");

    await fs.writeFile(
      tsFile,
      `
      import type { Extension } from '@coder/cmux/ext';
      const ext: Extension = {};
      export default ext;
    `
    );

    // Compile to populate cache
    const jsPath = await compileExtension(tsFile);

    // Verify cache file exists
    const existsBefore = await fs
      .access(jsPath)
      .then(() => true)
      .catch(() => false);
    expect(existsBefore).toBe(true);

    // Clear cache
    await clearCompilationCache();

    // Verify cache file removed
    const existsAfter = await fs
      .access(jsPath)
      .then(() => true)
      .catch(() => false);
    expect(existsAfter).toBe(false);

    // Verify cache directory removed
    const dirExists = await fs
      .access(CACHE_DIR)
      .then(() => true)
      .catch(() => false);
    expect(dirExists).toBe(false);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test.concurrent("should report cache size", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cmux-ts-ext-"));

  try {
    // Initially cache is empty
    const sizeBefore = await getCompilationCacheSize();
    expect(sizeBefore).toBe(0);

    const tsFile = path.join(tempDir, "test.ts");
    await fs.writeFile(
      tsFile,
      `
      import type { Extension } from '@coder/cmux/ext';
      const ext: Extension = {};
      export default ext;
    `
    );

    // Compile to populate cache
    await compileExtension(tsFile);

    // Cache should have non-zero size
    const sizeAfter = await getCompilationCacheSize();
    expect(sizeAfter).toBeGreaterThan(0);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
