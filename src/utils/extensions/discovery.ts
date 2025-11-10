import * as fs from "fs/promises";
import * as path from "path";
import type { ExtensionInfo, ExtensionManifest } from "@/types/extensions";
import { log } from "@/services/log";

/**
 * Discover extensions from a specific directory.
 *
 * Supports two formats:
 * - Single .js file: my-extension.js
 * - Folder with manifest.json: my-extension/manifest.json → { "entrypoint": "index.js" }
 *
 * @param extensionDir Absolute path to the extension directory to scan
 * @returns Array of discovered extensions
 */
export async function discoverExtensions(extensionDir: string): Promise<ExtensionInfo[]> {
  const extensions: ExtensionInfo[] = [];

  try {
    await fs.access(extensionDir);
  } catch {
    // Directory doesn't exist
    log.debug(`Extension directory ${extensionDir} does not exist`);
    return extensions;
  }

  try {
    const entries = await fs.readdir(extensionDir);

    for (const entry of entries) {
      const entryPath = path.join(extensionDir, entry);

      try {
        const stat = await fs.stat(entryPath);

        if (stat.isFile() && (entry.endsWith(".js") || entry.endsWith(".ts"))) {
          // Single-file extension (.js or .ts)
          // NOTE: id is now the full path (set by discoverExtensionsWithPrecedence)
          extensions.push({
            id: entryPath, // Full path as ID
            path: entryPath,
            type: "file",
            source: "global", // Placeholder, will be overridden by discoverExtensionsWithPrecedence
            needsCompilation: entry.endsWith(".ts"),
          });
          log.debug(`Discovered single-file extension: ${entryPath}`);
        } else if (stat.isDirectory()) {
          // Folder extension - check for manifest.json
          const manifestPath = path.join(entryPath, "manifest.json");

          try {
            await fs.access(manifestPath);
          } catch {
            // No manifest.json, skip
            continue;
          }

          try {
            const manifestContent = await fs.readFile(manifestPath, "utf-8");
            const manifest = JSON.parse(manifestContent) as ExtensionManifest;

            if (!manifest.entrypoint) {
              log.error(`Extension ${entry}: manifest.json missing 'entrypoint' field`);
              continue;
            }

            const entrypointPath = path.join(entryPath, manifest.entrypoint);

            try {
              await fs.access(entrypointPath);
            } catch {
              log.error(
                `Extension ${entry}: entrypoint '${manifest.entrypoint}' not found at ${entrypointPath}`
              );
              continue;
            }

            // NOTE: id is the full path to the folder (not the entrypoint)
            extensions.push({
              id: entryPath, // Full path to folder as ID
              path: entrypointPath, // Full path to entrypoint file
              type: "folder",
              source: "global", // Placeholder, will be overridden by discoverExtensionsWithPrecedence
              entrypoint: manifest.entrypoint,
              needsCompilation: manifest.entrypoint.endsWith(".ts"),
            });
            log.debug(`Discovered folder extension: ${entryPath} (entrypoint: ${manifest.entrypoint})`);
          } catch (error) {
            log.error(`Failed to parse manifest for extension ${entry}:`, error);
          }
        }
      } catch (error) {
        log.error(`Failed to stat extension entry ${entry} in ${extensionDir}:`, error);
      }
    }
  } catch (error) {
    log.error(`Failed to scan extension directory ${extensionDir}:`, error);
  }

  log.info(`Discovered ${extensions.length} extension(s) from ${extensionDir}`);
  return extensions;
}


/**
 * Discover extensions from multiple directories with precedence.
 * Extension IDs are full absolute paths, so there are no duplicates.
 * All extensions from all directories are returned with their source information.
 * 
 * @param extensionDirs Array of { path, source } in priority order (first = highest priority)
 * @returns Array of extensions with source information
 * 
 * @example
 * // Discover from both project and global directories
 * const extensions = await discoverExtensionsWithPrecedence([
 *   { path: "/path/to/project/.cmux/ext", source: "project", projectPath: "/path/to/project" },
 *   { path: "~/.cmux/ext", source: "global" }
 * ]);
 */
export async function discoverExtensionsWithPrecedence(
  extensionDirs: Array<{ path: string; source: "global" | "project"; projectPath?: string }>
): Promise<Array<ExtensionInfo>> {
  const allExtensions: ExtensionInfo[] = [];

  // Process all directories and collect extensions
  for (const { path: dir, source, projectPath } of extensionDirs) {
    const discovered = await discoverExtensions(dir);

    for (const ext of discovered) {
      // Update source information (was placeholder from discoverExtensions)
      allExtensions.push({
        ...ext,
        source,
        projectPath,
      });

      log.info(
        `Loaded extension ${ext.id} from ${source}${projectPath ? ` (${projectPath})` : ""}`
      );
    }
  }

  return allExtensions;
}
