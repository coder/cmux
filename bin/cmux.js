#!/usr/bin/env node

const { spawn } = require("child_process");
const path = require("path");

// Check if we're running in server mode
const isServer = process.argv.includes("server");

if (isServer) {
  // Run server mode directly with Node
  require("../dist/main.js");
} else {
  // Launch Electron desktop app
  const electron = require("electron");
  const appPath = path.join(__dirname, "..");
  
  const child = spawn(electron, [appPath, ...process.argv.slice(2)], {
    stdio: "inherit",
    windowsHide: false,
  });
  
  child.on("close", (code) => {
    process.exit(code);
  });
}

