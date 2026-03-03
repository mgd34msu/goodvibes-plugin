import { Command } from 'commander';

/**
 * Register the `greet <name>` command.
 * Prints a friendly greeting to the named person.
 */
export function registerGreetCommand(program: Command): void {
  program
    .command('greet <name>')
    .description('Print a greeting for the given name')
    .option('-u, --upper', 'print the greeting in uppercase')
    .action((name: string, options: { upper?: boolean }) => {
      const greeting = `Hello, ${name}! Welcome to the demo CLI.`;
      console.log(options.upper ? greeting.toUpperCase() : greeting);
    });
}
