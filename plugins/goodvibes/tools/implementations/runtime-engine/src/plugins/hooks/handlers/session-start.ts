/**
 * SessionStart Handler
 *
 * Emits session:started event and optionally injects runtime state
 * as additionalContext.
 */

import type { HookEvent } from '../../../extensions/events/factories.js';
import type { ClaudeHookResponse } from '../hook-processor.js';
import type { EventBus } from '../../../extensions/events/event-bus.js';
import { createLogger } from '../../../shared/logger.js';

const logger = createLogger('handler:session-start');

export interface SessionStartDeps {
  eventBus: EventBus | null;
}

/**
 * Creates a SessionStart handler.
 *
 * Emits session:started on the event bus so triggers can react
 * (e.g. resetting fire counts, initialising workflow state).
 */
export function createSessionStartHandler(
  deps: SessionStartDeps,
): (event: HookEvent, input: Record<string, unknown>) => Promise<ClaudeHookResponse | null> {
  return async function handleSessionStart(
    event: HookEvent,
    input: Record<string, unknown>,
  ): Promise<ClaudeHookResponse | null> {
    const sessionId = event.session_id;
    const cwd = typeof input['cwd'] === 'string' ? input['cwd'] : process.cwd();

    logger.info('Session started', { sessionId, cwd });

    if (deps.eventBus) {
      try {
        deps.eventBus.emit({
          id: `evt_session_start_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: Date.now(),
          type: 'session:started',
          source: { kind: 'hook', hook_name: 'session_start' },
          payload: {
            type: 'session:started',
            data: {
              session_id: sessionId,
              cwd,
              project_root: cwd,
              // Known modes: 'vibecoding' (default) and 'justvibes'.
              // Any unrecognised value falls back to 'vibecoding'.
              mode: (input['mode'] === 'justvibes' ? 'justvibes' : 'vibecoding'),
            },
          },
          metadata: { session_id: sessionId },
        });
      } catch (err) {
        logger.warn('Failed to emit session:started', {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return null;
  };
}
