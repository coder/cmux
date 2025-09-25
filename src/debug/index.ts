#!/usr/bin/env bun

import { parseArgs } from 'util';
import { uiMessagesCommand } from './ui-messages';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    workspace: { type: 'string' }
  },
  allowPositionals: true
});

const command = positionals[0];

switch (command) {
  case 'ui-messages':
    await uiMessagesCommand(values.workspace);
    break;
  default:
    console.log('Usage: bun debug ui-messages --workspace <workspace-key>');
    process.exit(1);
}