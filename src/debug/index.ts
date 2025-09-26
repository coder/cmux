#!/usr/bin/env bun

import { parseArgs } from 'util';
import { uiMessagesCommand } from './ui-messages';
import { listWorkspacesCommand } from './list-workspaces';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    workspace: { type: 'string' },
    drop: { type: 'string' }
  },
  allowPositionals: true
});

const command = positionals[0];

switch (command) {
  case 'ui-messages':
    const dropCount = values.drop ? parseInt(values.drop, 10) : 0;
    await uiMessagesCommand(values.workspace, dropCount);
    break;
  case 'list-workspaces':
    await listWorkspacesCommand();
    break;
  default:
    console.log('Usage:');
    console.log('  bun debug ui-messages --workspace <workspace-key> [--drop <n>]');
    console.log('  bun debug list-workspaces');
    process.exit(1);
}