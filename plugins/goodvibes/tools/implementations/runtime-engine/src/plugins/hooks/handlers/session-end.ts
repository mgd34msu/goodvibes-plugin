/**
 * SessionEnd Handler
 *
 * Emits session:ended event for cleanup.
 */

import type { HookEvent } from '../../../extensions/events/hook-event.js';
import type { ClaudeHookResponse } from '../hook-processor.js';
import type { EventBus } from '../../../events/event-bus.js';
import { createLogger } from '../../../shared/logger.js';

const logger = createLogger('handler:session-end');

export interface SessionEndDeps {
  eventBus: EventBus | null;
}

/**
 * Creates a SessionEnd handler.
 *
 * Emits session:ended so subscribers can flush telemetry, persist state, etc.
 */
export function createSessionEndHandler(
  deps: SessionEndDeps,
): (event: HookEvent, input: Record<string, unknown>) => Promise<ClaudeHookResponse | null> {
  return async function handleSessionEnd(
    event: HookEvent,
    _input: Record<string, unknown>,
  ): Promise<ClaudeHookResponse | null> {
    const sessionId = event.session_id;
    logger.info('Session ended', { sessionId });

    if (deps.eventBus) {
      try {
        deps.eventBus.emit({
          id: `evt_session_end_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          type: 'session:ended',
          source: { kind: 'hook', hook_name: 'session_end' },
          payload: {
            type: 'session:ended',
            data: { session_id: sessionId },
          },
          metadata: { session_id: sessionId },
        });
      } catch (err) {
        logger.warn('Failed to emit session:ended', {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return null;
  };
}
