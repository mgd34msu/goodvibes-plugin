/**
 * CI Failure Handler
 *
 * TriggerActionHandler that bridges incoming CI webhook events to `build:failed`
 * events on the EventBus. Only emits when the CI status indicates failure;
 * success and pending events are silently ignored to prevent spurious
 * build fix loop triggers.
 */

import { createLogger } from '../../../shared/logger.js';
import { generateEventId, timestamp } from '../../../shared/utils.js';
import type { TriggerActionHandler, EventEmitter } from '../../../core/types.js';
import type { RuntimeEvent } from '../../../shared/events.js';

const log = createLogger('handler:ci');

/** CI status values that represent a failed pipeline. */
const FAILURE_STATUSES = new Set(['failure', 'failed', 'error']);

/**
 * Factory that creates a TriggerActionHandler for bridging CI webhook failures
 * to `build:failed` events.
 *
 * Expected trigger args (from `builtin_ci_failure` args_template):
 * - `status`          (string) — CI pipeline status (e.g. `"failure"`, `"success"`).
 * - `provider`        (string) — CI provider name (e.g. `"github-actions"`).
 * - `branch`          (string) — Git branch the CI run was for.
 * - `commit`          (string) — Git commit SHA.
 * - `source_event_id` (string) — ID of the originating webhook event.
 *
 * Emits a `build:failed` event on the provided EventEmitter when `status` is
 * one of: `failure`, `failed`, `error`. All other status values are ignored.
 *
 * @param _projectRoot - Absolute path to the project root (reserved for future use).
 * @param emitter      - EventEmitter used to publish the `build:failed` event.
 * @returns A TriggerActionHandler.
 */
export function bridgeCIFailure(
  _projectRoot: string,
  emitter: EventEmitter,
): TriggerActionHandler {
  return async (
    args: Record<string, unknown>,
    _event: RuntimeEvent,
  ): Promise<void> => {
    const status = typeof args['status'] === 'string' ? args['status'].toLowerCase() : '';

    if (!FAILURE_STATUSES.has(status)) {
      log.debug('CI event is not a failure — skipping', { status });
      return;
    }

    const provider = typeof args['provider'] === 'string' ? args['provider'] : 'ci';
    const branch = typeof args['branch'] === 'string' ? args['branch'] : 'unknown';
    const commit = typeof args['commit'] === 'string' ? args['commit'] : 'unknown';
    const sourceEventId = typeof args['source_event_id'] === 'string' ? args['source_event_id'] : '';

    log.info('CI failure detected — emitting build:failed', { provider, branch, commit, status });

    emitter.emit({
      id: generateEventId(),
      timestamp: timestamp(),
      type: 'build:failed',
      source: { kind: 'system' },
      payload: {
        type: 'build:failed',
        data: {
          command: `ci:${provider}`,
          exit_code: 1,
          duration_ms: 0,
          errors: [
            `CI pipeline failed on branch "${branch}" at commit "${commit}" (status: ${status})`,
          ],
          warnings: [],
          // Extra context for downstream handlers
          ci_provider: provider,
          ci_branch: branch,
          ci_commit: commit,
          ci_status: status,
          source_event_id: sourceEventId,
        } as Record<string, unknown>,
      },
    });
  };
}
