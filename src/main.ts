#!/usr/bin/env node

// this is a test

const isServer = process.argv.length > 2 && process.argv[2] === "server";

if (isServer) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./main-server");
} else {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./main-desktop");
}
