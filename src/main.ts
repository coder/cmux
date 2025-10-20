#!/usr/bin/env node
/**
 * The main CLI entrypoint for cmux.
 *
 * When run as a CLI (via npm/npx), defaults to server mode.
 * When run as an Electron app, runs desktop mode.
 */

// Check if running as CLI or Electron
const isElectron = process.versions && process.versions.electron !== undefined;

// CLI usage: run server by default (unless --desktop flag is passed)
// Electron usage: run desktop
const isServer = !isElectron || process.argv.includes("--server");

if (isServer) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./main-server");
} else {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./main-desktop");
}
