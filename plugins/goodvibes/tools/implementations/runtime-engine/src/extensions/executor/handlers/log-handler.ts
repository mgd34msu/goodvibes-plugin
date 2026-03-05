/**
 * Log Handler
 *
 * TriggerActionHandler implementation that appends structured activity entries
 * to `.goodvibes/logs/activity.md` in a human-readable Markdown format.
 */

import { appendFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createLogger } from '../../../shared/logger.js';
import { toErrorMessage } from '../../../shared/utils.js';
import type { RuntimeEvent } from '../../../shared/events.js';
import type { TriggerActionHandler } from '../../../core/types.js';

const log = createLogger('handler:log');

/**
 * Formats an activity log entry in standard Markdown format.
 *
 * @param event - The triggering runtime event.
 * @param args  - Resolved handler arguments.
 * @returns Formatted Markdown string (with trailing newline).
 */
function formatLogEntry(event: RuntimeEvent, args: Record<string, unknown>): string {
  const ts = new Date().toISOString();
  const lines: string[] = [
    `## ${ts}`,
    '',
    `**Event**: \`${event.type}\``,
    `**Event ID**: \`${event.id}\``,
  ];

  if (Object.keys(args).length > 0) {
    lines.push('**Args**:');
    for (const [key, value] of Object.entries(args)) {
      lines.push(`- \`${key}\`: ${JSON.stringify(value)}`);
    }
  }

  if (event.payload && typeof event.payload === 'object') {
    const data = (event.payload as Record<string, unknown>)['data'];
    if (data !== undefined && data !== null) {
      lines.push(`**Payload**: \`${JSON.stringify(data)}\``);
    }
  }

  lines.push('', '---', '');
  return lines.join('\n');
}

/**
 * Factory that creates a TriggerActionHandler that appends event details
 * to `.goodvibes/logs/activity.md`.
 *
 * The handler accepts any args — all key/value pairs are included in the
 * log entry.
 *
 * @param projectRoot - Absolute path to the project root directory.
 * @returns A TriggerActionHandler.
 */
export function logEvent(projectRoot: string): TriggerActionHandler {
  return async (
    args: Record<string, unknown>,
    event: RuntimeEvent,
  ): Promise<void> => {
    const logPath = join(projectRoot, '.goodvibes', 'logs', 'activity.md');

    try {
      await mkdir(dirname(logPath), { recursive: true });
      const entry = formatLogEntry(event, args);
      await appendFile(logPath, entry, 'utf-8');
      log.debug('Activity logged', { eventType: event.type, logPath });
    } catch (err) {
      log.error('Failed to append activity log', { error: toErrorMessage(err), logPath });
    }
  };
}
