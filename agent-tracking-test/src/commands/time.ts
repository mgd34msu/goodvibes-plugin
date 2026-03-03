import { Command } from 'commander';
import { toISO, toUnix, toHumanReadable, toLocale } from '../utils/format';

/**
 * Register the `time` command.
 * Prints the current date and time in multiple formats.
 */
export function registerTimeCommand(program: Command): void {
  program
    .command('time')
    .description('Print the current date and time in multiple formats')
    .option('-f, --format <format>', 'output a specific format (iso|unix|human|locale)', 'all')
    .action((options: { format: string }) => {
      const now = new Date();

      const formats: Record<string, () => void> = {
        iso: () => console.log(`ISO:    ${toISO(now)}`),
        unix: () => console.log(`Unix:   ${toUnix(now)}`),
        human: () => console.log(`Human:  ${toHumanReadable(now)}`),
        locale: () => console.log(`Locale: ${toLocale(now)}`),
      };

      if (options.format === 'all') {
        console.log('Current time:');
        Object.values(formats).forEach((fn) => fn());
      } else if (formats[options.format]) {
        formats[options.format]();
      } else {
        console.error(`Unknown format: ${options.format}. Use iso, unix, human, or locale.`);
        process.exit(1);
      }
    });
}
