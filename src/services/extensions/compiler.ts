/**
 * TypeScript Extension Compiler
 *
 * Compiles .ts extensions to .js using esbuild with file-based caching.
 * Cache is invalidated when source file changes (based on mtime + content hash).
 */

import * as esbuild from "esbuild";
import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";
import * as os from "os";
import { log } from "../log";

const CACHE_DIR = path.join(os.homedir(), ".cmux", "ext-cache");

/**
 * Compile a TypeScript extension to JavaScript
 * Returns path to compiled .js file (cached or freshly compiled)
 */
export async function compileExtension(tsPath: string): Promise<string> {
  try {
    // Generate cache key from file path + mtime + content hash
    const stat = await fs.stat(tsPath);
    const content = await fs.readFile(tsPath, "utf-8");
    const hash = crypto
      .createHash("sha256")
      .update(tsPath)
      .update(stat.mtime.toISOString())
      .update(content)
      .digest("hex")
      .slice(0, 16);

    const cachedPath = path.join(CACHE_DIR, `${hash}.js`);

    // Check cache
    try {
      await fs.access(cachedPath);
      log.debug(`Extension cache hit: ${path.basename(tsPath)} → ${cachedPath}`);
      return cachedPath;
    } catch {
      // Cache miss, need to compile
      log.debug(`Extension cache miss: ${path.basename(tsPath)}, compiling...`);
    }

    // Ensure cache directory exists
    await fs.mkdir(CACHE_DIR, { recursive: true });

    // Compile with esbuild
    const result = await esbuild.build({
      entryPoints: [tsPath],
      outfile: cachedPath,
      bundle: true,
      format: "esm",
      platform: "node",
      target: "node20",
      sourcemap: "inline", // Embed source maps for debugging
      external: ["@coder/cmux/ext"], // Don't bundle type imports
      logLevel: "silent", // We handle errors ourselves
    });

    if (result.errors.length > 0) {
      const errorText = result.errors.map((e) => e.text).join(", ");
      throw new Error(`TypeScript compilation failed: ${errorText}`);
    }

    log.info(`Compiled TypeScript extension: ${path.basename(tsPath)} → ${cachedPath}`);
    return cachedPath;
  } catch (error) {
    // Re-throw with more context
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to compile ${path.basename(tsPath)}: ${errorMsg}`);
  }
}

/**
 * Clear the compilation cache
 */
export async function clearCompilationCache(): Promise<void> {
  try {
    await fs.rm(CACHE_DIR, { recursive: true, force: true });
    log.info("Extension compilation cache cleared");
  } catch (error) {
    log.error(`Failed to clear compilation cache: ${error}`);
  }
}

/**
 * Get the size of the compilation cache in bytes
 */
export async function getCompilationCacheSize(): Promise<number> {
  try {
    const entries = await fs.readdir(CACHE_DIR);
    let totalSize = 0;

    for (const entry of entries) {
      const entryPath = path.join(CACHE_DIR, entry);
      const stat = await fs.stat(entryPath);
      totalSize += stat.size;
    }

    return totalSize;
  } catch {
    return 0; // Cache doesn't exist yet
  }
}
