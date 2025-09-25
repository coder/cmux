#!/usr/bin/env bun

import { parseArgs } from 'util';
import { uiMessagesCommand } from './ui-messages';

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
  default:
    console.log('Usage: bun debug ui-messages --workspace <workspace-key> [--drop <n>]');
    process.exit(1);
}