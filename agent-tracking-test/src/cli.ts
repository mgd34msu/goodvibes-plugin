#!/usr/bin/env node
import { Command } from 'commander';
import { registerGreetCommand } from './commands/greet';
import { registerTimeCommand } from './commands/time';

const program = new Command();

program
  .name('demo-cli')
  .description('A minimal demo CLI tool')
  .version('1.0.0');

registerGreetCommand(program);
registerTimeCommand(program);

program.parse(process.argv);
