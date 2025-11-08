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

        if (stat.isFile() && entry.endsWith(".js")) {
          // Single-file extension
          extensions.push({
            id: entry.replace(/\.js$/, ""),
            path: entryPath,
            type: "file",
          });
          log.debug(`Discovered single-file extension: ${entry}`);
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

            extensions.push({
              id: entry,
              path: entrypointPath,
              type: "folder",
              entrypoint: manifest.entrypoint,
            });
            log.debug(`Discovered folder extension: ${entry} (entrypoint: ${manifest.entrypoint})`);
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
