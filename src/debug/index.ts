#!/usr/bin/env bun

import { parseArgs } from "util";
import { listWorkspacesCommand } from "./list-workspaces";

const { positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    workspace: { type: "string", short: "w" },
    drop: { type: "string", short: "d" },
    limit: { type: "string", short: "l" },
    all: { type: "boolean", short: "a" },
  },
  allowPositionals: true,
});

const command = positionals[0];

switch (command) {
  case "list-workspaces":
    await listWorkspacesCommand();
    break;
  default:
    console.log("Usage:");
    console.log("  bun debug list-workspaces");
    process.exit(1);
}
