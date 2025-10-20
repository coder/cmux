#!/usr/bin/env node

const isServer = process.argv.includes("server");
const isElectron = process.versions.electron !== undefined;

if (isServer) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./main-server");
} else if (isElectron) {
  // Already running in Electron, launch desktop
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./main-desktop");
} else {
  // Running in Node, need to spawn Electron
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { spawn } = require("child_process");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("path");
  
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electron = require("electron");
  const appPath = path.join(__dirname, "..");
  
  const child = spawn(electron, [appPath, ...process.argv.slice(2)], {
    stdio: "inherit",
  });
  
  child.on("close", (code) => {
    process.exit(code);
  });
}
