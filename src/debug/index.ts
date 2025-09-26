#!/usr/bin/env bun

import { parseArgs } from "util";
import { uiMessagesCommand } from "./ui-messages";
import { listWorkspacesCommand } from "./list-workspaces";

const { values, positionals } = parseArgs({
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
  case "ui-messages":
    const dropCount = values.drop ? parseInt(values.drop, 10) : 0;
    const limit = values.all ? 0 : values.limit ? parseInt(values.limit, 10) : 64;
    await uiMessagesCommand(values.workspace, dropCount, limit);
    break;
  case "list-workspaces":
    await listWorkspacesCommand();
    break;
  default:
    console.log("Usage:");
    console.log("  bun debug ui-messages --workspace <workspace-key> [options]");
    console.log("    -w, --workspace <key>  Workspace key (required)");
    console.log("    -d, --drop <n>         Drop last n messages");
    console.log("    -l, --limit <n>        Limit to most recent n messages (default: 64)");
    console.log("    -a, --all              Show all messages (overrides limit)");
    console.log("");
    console.log("  bun debug list-workspaces");
    process.exit(1);
}
