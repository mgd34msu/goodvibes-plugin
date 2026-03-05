/**
 * Notify Handler
 *
 * Provides two notification implementations:
 * - `notifyUser` — TriggerActionHandler that writes a JSON notification file
 *   to `.goodvibes/notifications/`.
 * - `notifyComplete` — ActionHandler (workflow) that emits a completion
 *   notification for the current workflow.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createLogger } from '../../../shared/logger.js';
import { toErrorMessage, generateId, timestamp } from '../../../shared/utils.js';
import type { RuntimeEvent } from '../../../shared/events.js';
import type { TriggerActionHandler } from '../../../core/types.js';
import type { WorkflowContext } from '../../workflow/types.js';

const log = createLogger('handler:notify');

/** Shape of a notification record written to disk. */
interface NotificationRecord {
  /** ISO-8601 timestamp when the notification was created. */
  timestamp: string;
  /** Human-readable notification message. */
  message: string;
  /** Identifier for the trigger or component that produced this notification. */
  source: string;
  /** Severity level — informational, warning, or error. */
  severity: 'info' | 'warn' | 'error';
}

/**
 * Factory that creates a TriggerActionHandler that writes a notification file
 * to `.goodvibes/notifications/<timestamp>-<id>.json`.
 *
 * Expected trigger args:
 * - `message`  (string) — notification text.
 * - `source`   (string) — originating component or trigger name.
 * - `severity` ('info' | 'warn' | 'error') — defaults to `'info'`.
 *
 * @param projectRoot - Absolute path to the project root directory.
 * @returns A TriggerActionHandler.
 */
export function notifyUser(projectRoot: string): TriggerActionHandler {
  return async (
    args: Record<string, unknown>,
    _event: RuntimeEvent,
  ): Promise<void> => {
    const message = typeof args['message'] === 'string' ? args['message'] : 'Notification';
    const source = typeof args['source'] === 'string' ? args['source'] : 'runtime-engine';
    const rawSeverity = args['severity'];
    const severity: NotificationRecord['severity'] =
      rawSeverity === 'warn' || rawSeverity === 'error' ? rawSeverity : 'info';

    const notificationsDir = join(projectRoot, '.goodvibes', 'notifications');
    const id = generateId();
    const ts = timestamp();
    const filename = `${ts}-${id}.json`;
    const filePath = join(notificationsDir, filename);

    const record: NotificationRecord = {
      timestamp: new Date().toISOString(),
      message,
      source,
      severity,
    };

    try {
      await mkdir(notificationsDir, { recursive: true });
      await writeFile(filePath, JSON.stringify(record, null, 2), 'utf-8');
      log.info('Notification written', { filePath, severity, source });
    } catch (err) {
      log.error('Failed to write notification', { error: toErrorMessage(err), filePath });
    }
  };
}

/**
 * Workflow ActionHandler that emits a notification about workflow completion.
 *
 * Writes a notification record indicating the workflow has reached a terminal
 * state. Reads the workflow ID from `context.workflow_id` if available.
 *
 * @param context - Current workflow context (read-only in this handler).
 * @param config  - Action config; may contain `source` (string) override.
 */
export async function notifyComplete(
  context: WorkflowContext,
  config: Record<string, unknown>,
): Promise<void> {
  const source = typeof config['source'] === 'string' ? config['source'] : 'workflow-engine';
  const workflowId = typeof context['workflow_id'] === 'string' ? context['workflow_id'] : 'unknown';
  const task = typeof context['task'] === 'string' ? context['task'] : 'unnamed task';

  log.info('Workflow completed', { workflowId, task, source });
}
